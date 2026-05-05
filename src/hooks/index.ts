import { spawn } from "node:child_process";
import { HeadsDownClient } from "@headsdown/sdk";
import { reportAgentRunEventCompat } from "../agent-run-reporter.js";
import { clearRunState, getActiveRunStateForSession } from "../agent-run-state.js";
import { postToolUseHandler } from "./post-tool-use.js";
import {
  asRecord,
  createCliRunner,
  outputJson,
  parseJsonObject,
  readStdin,
  runCliJson,
  stringField,
  type CliRunner,
} from "./runtime.js";

const SESSION_END_REASONS = new Set([
  "clear",
  "resume",
  "logout",
  "prompt_input_exit",
  "bypass_permissions_disabled",
  "other",
]);
const SAFE_SESSION_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,256}$/;

export async function hookCli(eventName = process.argv[3]): Promise<void> {
  const input = await readStdin();
  const runner = createCliRunner();
  const payload = await runHook(eventName, input, runner);
  outputJson(payload);
}

export async function runHook(
  eventName: string | undefined,
  input: string,
  runner: CliRunner,
): Promise<unknown> {
  switch (eventName) {
    case "session-start":
      return await sessionStartHandler(runner);
    case "user-prompt-submit":
      return await passthroughJson(runner, ["autopilot", "prompt"]);
    case "pre-tool-use-edit":
      return await preToolUseEditHandler(input, runner);
    case "pre-tool-use-ask":
      return await passthroughJson(runner, ["autopilot", "intercept-ask"]);
    case "post-tool-use":
      return await postToolUseHandler(input, runner);
    case "pre-compact":
      return await preCompactHandler(runner);
    case "stop-detect-deferral":
      return await stopDetectDeferralHandler(runner);
    case "stop-report":
      await runner(["report"]);
      return undefined;
    case "session-end":
      sessionEndHandler(input);
      return undefined;
    case "session-end-report":
      await sessionEndReportHandler();
      return undefined;
    default:
      process.exitCode = 1;
      return undefined;
  }
}

async function sessionStartHandler(runner: CliRunner): Promise<unknown> {
  const queuedMarker = asRecord(await runCliJson(runner, ["action-marker", "active"], null));
  const queuedRunId = stringField(queuedMarker?.runId);
  if (queuedRunId) {
    const handoffState = stringField(queuedMarker?.handoffState) || "unknown";
    const attemptByAction = asRecord(queuedMarker?.attemptByAction);
    const queuedAction = attemptByAction?.queue_for_morning
      ? "queue_for_morning"
      : stringField(queuedMarker?.handoffKind) || "unknown";
    const systemMessage =
      queuedAction === "queue_for_morning"
        ? `[HeadsDown] Off the clock. Save the handoff and ask tomorrow. Run ${queuedRunId} is queued (handoff: ${handoffState}). Do not continue or ask again until resume_run succeeds or the user explicitly allows continuation. Claude Code controls the model. HeadsDown controls the run.`
        : `[HeadsDown] Queued run ${queuedRunId} is waiting. Handoff state: ${handoffState}. Do not continue or ask again until HeadsDown returns resume_run or the user explicitly resumes the run.`;
    return { systemMessage };
  }

  const statusResult = await runner(["status"]);
  if (statusResult.code !== 0 || !statusResult.stdout) return undefined;
  const status = asRecord(parseJsonObject(statusResult.stdout));
  if (!status) return undefined;

  const contract = asRecord(status.contract);
  const availability = asRecord(status.availability);
  const renderedCall = asRecord(status.renderedHeadsDownCall);
  let context = stringField(renderedCall?.text)
    ? `[HeadsDown] ${stringField(renderedCall?.text).replace(/\s+/g, " ")} Supporting availability context:`
    : "[HeadsDown] Supporting availability context:";

  const mode = stringField(contract?.mode) || "unknown";
  const statusText = stringField(contract?.statusText);
  if (mode === "unknown") {
    context += " Axis 1 (availability mode): not set.";
  } else {
    context += ` Axis 1 (availability mode, user-set): ${mode}.`;
    if (statusText) context += ` Status: ${statusText}.`;
  }

  if (availability) {
    context +=
      availability.inReachableHours === true
        ? " Currently in available hours."
        : " Currently outside available hours.";
    const activeWindow = asRecord(availability.activeWindow);
    const activeWindowLabel = stringField(activeWindow?.label);
    if (activeWindowLabel) context += ` Active window: ${activeWindowLabel}.`;
    const wrapUpGuidance = asRecord(availability.wrapUpGuidance);
    if (typeof wrapUpGuidance?.remainingMinutes === "number") {
      context += ` Remaining attention budget: ${wrapUpGuidance.remainingMinutes} minutes.`;
    }
  }

  const executionDirective = asRecord(status.executionDirective);
  const executionDirectiveCode = stringField(executionDirective?.code);
  const executionDirectiveSummary = stringField(executionDirective?.summary);
  if (executionDirectiveCode) {
    context += ` Axis 2 (execution directive, schedule-derived): ${executionDirectiveCode}.`;
    if (executionDirectiveSummary) context += ` ${executionDirectiveSummary}`;
  }

  const wrapUpInstruction = stringField(status.wrapUpInstruction);
  if (wrapUpInstruction) context += ` Execution guidance: ${wrapUpInstruction}`;

  const transition = asRecord(await runCliJson(runner, ["next-window"], null));
  if (transition && typeof transition.minutesUntil === "number") {
    const nextLabel = stringField(transition.nextWindowLabel);
    const nextMode = stringField(transition.nextWindowMode);
    context += nextLabel
      ? ` Transition in ${transition.minutesUntil} minutes: next window is '${nextLabel}' (${nextMode}).`
      : ` Availability window transition in ${transition.minutesUntil} minutes.`;
    if (typeof transition.wrapUpThresholdMinutes === "number") {
      context += ` Wrap-up threshold is ${transition.wrapUpThresholdMinutes} minutes before transition.`;
    }
  }

  const digestResult = await runner(["digest-count"]);
  const digestCount = Number.parseInt(digestResult.stdout || "0", 10) || 0;
  if (digestCount === 1)
    context +=
      " You have 1 digest summary from your last focus session. Use headsdown_digest to review what you missed.";
  if (digestCount > 1)
    context += ` You have ${digestCount} digest summaries from your last focus session. Use headsdown_digest to review what you missed.`;

  const continuationResult = await runner(["continuation", "check"]);
  if (continuationResult.code === 0) {
    context +=
      " [Continuation] A previous session left resumable work. Call headsdown_continuation with action 'load' for full details.";
  }

  const wakeUp = asRecord(await runCliJson(runner, ["autopilot", "wake-up"], null));
  const wakeUpContext = stringField(asRecord(wakeUp?.hookSpecificOutput)?.additionalContext);
  const autopilotPrompt = asRecord(
    await runCliJson(runner, ["autopilot", "prompt", "--as-session-context"], null),
  );
  const autopilotPromptContext = stringField(
    asRecord(autopilotPrompt?.hookSpecificOutput)?.additionalContext,
  );
  const additionalContext = [wakeUpContext, autopilotPromptContext].filter(Boolean).join("\n\n");

  if (additionalContext) {
    return {
      systemMessage: context,
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext },
    };
  }
  return { systemMessage: context };
}

async function preToolUseEditHandler(input: string, runner: CliRunner): Promise<unknown> {
  const queuedMarker = asRecord(await runCliJson(runner, ["action-marker", "active"], null));
  const queuedRunId = stringField(queuedMarker?.runId);
  if (queuedRunId) {
    const handoffState = stringField(queuedMarker?.handoffState) || "unknown";
    return {
      hookSpecificOutput: { permissionDecision: "deny" },
      systemMessage: `[HeadsDown] Run ${queuedRunId} is queued. Handoff state: ${handoffState}. Do not continue, modify files, or ask again until HeadsDown returns resume_run or the user explicitly resumes the run.`,
    };
  }

  const hookInput = parseJsonObject(input);
  const toolInput = asRecord(hookInput.tool_input) ?? asRecord(hookInput.toolInput);
  const filePath =
    stringField(toolInput?.file_path) ||
    stringField(toolInput?.path) ||
    stringField(toolInput?.filePath);
  const config = asRecord(
    await runCliJson(runner, ["config"], { trustLevel: "advisory", sensitivePaths: [] }),
  );
  const sensitivePaths = Array.isArray(config?.sensitivePaths)
    ? config.sensitivePaths.filter((item): item is string => typeof item === "string")
    : [];
  const sensitiveMatch = filePath
    ? sensitivePaths.find((pattern) => globishMatch(filePath, pattern))
    : undefined;
  if (sensitiveMatch) {
    return {
      hookSpecificOutput: { permissionDecision: "ask" },
      systemMessage: `[HeadsDown] Sensitive file detected: ${filePath} matches protected pattern '${sensitiveMatch}'. User confirmation required regardless of availability mode.`,
    };
  }

  const status = asRecord(await runCliJson(runner, ["status"], null));
  if (!status) return undefined;
  const contract = asRecord(status.contract);
  const mode = stringField(contract?.mode) || "none";
  const statusText = stringField(contract?.statusText);
  const statusLabel = statusText ? ` (${statusText})` : "";
  const lock = contract?.lock === true;
  const trustLevel = stringField(config?.trustLevel) || "advisory";
  const proposalCheck =
    trustLevel === "active" || trustLevel === "guarded"
      ? await runner(["proposals", "--check"])
      : null;
  const hasProposal = proposalCheck?.code === 0;
  const proposal = hasProposal ? asRecord(await runCliJson(runner, ["proposals"], null)) : null;
  const proposalDesc = stringField(proposal?.description);

  if (trustLevel === "advisory") {
    if (mode === "offline") {
      return {
        hookSpecificOutput: { permissionDecision: "ask" },
        systemMessage: `[HeadsDown] User is OFFLINE. Ask for explicit permission before making changes.`,
      };
    }
    if (mode === "busy" && lock) {
      return {
        hookSpecificOutput: { permissionDecision: "ask" },
        systemMessage: `[HeadsDown] User is in BUSY mode${statusLabel} with status locked. Ask before making changes.`,
      };
    }
    if (mode === "busy")
      return {
        systemMessage: `[HeadsDown] User is in BUSY mode${statusLabel}. Consider submitting a task proposal via headsdown_propose before proceeding.`,
      };
    if (mode === "limited")
      return {
        systemMessage: `[HeadsDown] User has LIMITED availability${statusLabel}. Keep changes small and focused.`,
      };
  }

  if (trustLevel === "active") {
    if (mode === "online" || mode === "none") {
      if (!hasProposal) return undefined;
      return {
        hookSpecificOutput: { permissionDecision: "allow" },
        systemMessage: `[HeadsDown] Auto-approved: online mode with approved proposal (${proposalDesc}).`,
      };
    }
    if (mode === "busy" && lock) {
      return {
        hookSpecificOutput: { permissionDecision: "ask" },
        systemMessage: `[HeadsDown] User is in BUSY mode${statusLabel} with status locked. Ask before proceeding.`,
      };
    }
    if (mode === "busy") {
      return hasProposal
        ? {
            hookSpecificOutput: { permissionDecision: "allow" },
            systemMessage: `[HeadsDown] Auto-approved: proposal approved (${proposalDesc}). User is busy${statusLabel}.`,
          }
        : {
            systemMessage: `[HeadsDown] User is BUSY${statusLabel}. Submit a task proposal via headsdown_propose before making changes.`,
          };
    }
    if (mode === "limited") {
      return hasProposal
        ? {
            hookSpecificOutput: { permissionDecision: "allow" },
            systemMessage: `[HeadsDown] Auto-approved: proposal approved (${proposalDesc}). Keep changes focused.`,
          }
        : {
            systemMessage: `[HeadsDown] User has LIMITED availability${statusLabel}. Submit a proposal or keep changes small.`,
          };
    }
    if (mode === "offline") {
      return {
        hookSpecificOutput: { permissionDecision: "ask" },
        systemMessage:
          "[HeadsDown] User is OFFLINE. Ask for explicit permission even with an approved proposal.",
      };
    }
  }

  if (trustLevel === "guarded") {
    if (mode === "online" || mode === "none") return undefined;
    if (mode === "busy" && lock) {
      return {
        hookSpecificOutput: { permissionDecision: "ask" },
        systemMessage: `[HeadsDown] User is BUSY${statusLabel} with status locked. Explicit permission required.`,
      };
    }
    if (mode === "busy") {
      return hasProposal
        ? {
            hookSpecificOutput: { permissionDecision: "allow" },
            systemMessage: `[HeadsDown] Approved: proposal verified (${proposalDesc}). Proceeding in busy mode.`,
          }
        : {
            hookSpecificOutput: { permissionDecision: "ask" },
            systemMessage: `[HeadsDown] User is BUSY${statusLabel}. No approved proposal found. Submit one via headsdown_propose or ask the user for permission.`,
          };
    }
    if (mode === "limited") {
      return hasProposal
        ? {
            hookSpecificOutput: { permissionDecision: "allow" },
            systemMessage: `[HeadsDown] Approved: proposal verified (${proposalDesc}). Keep changes focused.`,
          }
        : {
            hookSpecificOutput: { permissionDecision: "ask" },
            systemMessage: `[HeadsDown] User has LIMITED availability${statusLabel}. No approved proposal. Ask before proceeding.`,
          };
    }
    if (mode === "offline") {
      return {
        hookSpecificOutput: { permissionDecision: "ask" },
        systemMessage: "[HeadsDown] User is OFFLINE. All changes require explicit permission.",
      };
    }
  }

  return undefined;
}

async function preCompactHandler(runner: CliRunner): Promise<unknown> {
  const proposal = asRecord(await runCliJson(runner, ["proposals"], null));
  const status = asRecord(await runCliJson(runner, ["status"], null));
  const proposalDesc = stringField(proposal?.description);
  const estimatedFiles =
    proposal?.estimatedFiles === undefined ? "" : String(proposal.estimatedFiles);
  const wrapUpInstruction = stringField(status?.wrapUpInstruction);
  if (!proposalDesc && !wrapUpInstruction) return undefined;

  let context = "[HeadsDown] Before compaction:";
  if (proposalDesc) {
    context += ` You have an approved proposal: '${proposalDesc}'.`;
    if (estimatedFiles && estimatedFiles !== "0") context += ` (estimated ${estimatedFiles} files)`;
    context +=
      " Include this in your compaction summary so you can resume the task after context is rebuilt.";
  }
  if (wrapUpInstruction) context += ` Execution policy: ${wrapUpInstruction}`;
  return { systemMessage: context };
}

async function passthroughJson(runner: CliRunner, args: string[]): Promise<unknown> {
  const result = await runner(args);
  if (result.code !== 0 || !result.stdout) return undefined;
  return parseJsonObject(result.stdout);
}

async function stopDetectDeferralHandler(runner: CliRunner): Promise<unknown> {
  const result = await runner(["autopilot", "detect-deferral"]);
  if (result.code === 2) {
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = 2;
  }
  if (result.stdout) return parseJsonObject(result.stdout);
  return undefined;
}

function sessionEndHandler(input: string): void {
  try {
    const hookInput = parseJsonObject(input);
    const sessionId = safeSessionId(
      stringField(hookInput.session_id) ||
        stringField(hookInput.sessionId) ||
        process.env.CLAUDE_SESSION_ID ||
        "default",
    );
    const rawReason = stringField(hookInput.reason) || "other";
    const reason = SESSION_END_REASONS.has(rawReason) ? rawReason : "other";
    const endedAt = new Date().toISOString();
    const cliPath = process.argv[1];
    if (!cliPath) return;

    const child = spawn(process.execPath, [cliPath, "hook", "session-end-report"], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        HEADSDOWN_SESSION_END_SESSION_ID: sessionId,
        HEADSDOWN_SESSION_END_REASON: reason,
        HEADSDOWN_SESSION_END_ENDED_AT: endedAt,
      },
    });
    child.unref();
  } catch {
    // SessionEnd is best-effort and must never block Claude Code shutdown.
  }
}

async function sessionEndReportHandler(): Promise<void> {
  const activeRun = await getActiveRunStateForSession().catch(() => null);

  try {
    const sessionId = safeSessionId(process.env.HEADSDOWN_SESSION_END_SESSION_ID || "default");
    const rawReason = process.env.HEADSDOWN_SESSION_END_REASON || "other";
    const reason = SESSION_END_REASONS.has(rawReason) ? rawReason : "other";
    const endedAt = process.env.HEADSDOWN_SESSION_END_ENDED_AT || new Date().toISOString();
    const client = (await HeadsDownClient.fromCredentials()).withActor({
      source: "claude-code",
      agentId: "claude-code:session-end",
      sessionId,
      workspaceRef: "unknown",
    });
    const runId = activeRun?.runId ?? fallbackRunId(sessionId);
    await reportAgentRunEventCompat(client, {
      runId,
      eventType: "integration.session_ended",
      sequence: (activeRun?.sequence ?? 0) + 1,
      idempotencyKey: `${runId}:integration.session_ended:${sessionId}`,
      correlationId: activeRun?.proposalId ?? runId,
      proposalRef: activeRun?.proposalId ?? undefined,
      payload: {
        session_id: sessionId,
        outcome:
          reason === "logout" || reason === "clear" || reason === "resume"
            ? "succeeded"
            : "cancelled",
        reason,
        ended_at: endedAt,
      },
    });
  } catch {
    // SessionEnd is best-effort and must never block Claude Code shutdown.
  } finally {
    if (activeRun) await clearRunState(activeRun.runId).catch(() => undefined);
  }
}

function safeSessionId(value: string): string {
  return SAFE_SESSION_ID_PATTERN.test(value) ? value : "default";
}

function fallbackRunId(sessionId: string): string {
  return `run_${sessionId}`.slice(0, 256);
}

function globishMatch(value: string, pattern: string): boolean {
  const doubleStar = "__HEADSDOWN_DOUBLE_STAR__";
  const escaped = pattern
    .replace(/\*\*/g, doubleStar)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replaceAll(doubleStar, ".*");
  return new RegExp(`(^|/)${escaped}$`).test(value);
}
