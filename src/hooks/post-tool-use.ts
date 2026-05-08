import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  arrayOfStrings,
  asRecord,
  boolField,
  parseJsonObject,
  readCounter,
  runCliJson,
  stringField,
  type CliRunner,
  writeCounter,
} from "./runtime.js";
import {
  readSessionTimeboxPromptFingerprint,
  writeSessionTimeboxPromptFingerprint,
} from "../session-timebox.js";

export type ToolType = "read" | "write" | "external";

export async function postToolUseHandler(input: string, runner: CliRunner): Promise<unknown> {
  const hookInput = parseJsonObject(input);
  const toolName = stringField(hookInput.tool_name) || stringField(hookInput.toolName);
  const toolType = classifyTool(toolName);
  const sessionId = process.env.CLAUDE_SESSION_ID || "default";
  const counterFile = join(tmpdir(), `headsdown-file-count-${sessionId}`);
  const current = await readCounter(counterFile);
  const count = toolType === "write" ? current + 1 : current;
  if (toolType === "write") await writeCounter(counterFile, count);

  const proposal = asRecord(await runCliJson(runner, ["proposals"], null));
  const estimatedFiles = integerField(proposal?.estimatedFiles) ?? 0;

  const progress = await runProgress(runner, toolType, count);
  let message = `[HeadsDown] ${count} file(s) modified this session.`;
  let emitSystemMessage = toolType === "write";
  const contexts: string[] = [];

  if (estimatedFiles > 0 && count > Math.floor((estimatedFiles * 3) / 2)) {
    message += ` Scope warning: approved proposal estimated ${estimatedFiles} file(s), ${count} have been modified. Consider calling headsdown_propose with updated estimates.`;
  }

  const progressRecord = asRecord(progress.payload);
  if (progressRecord && boolField(progressRecord.attentionWindowClosing)) {
    const attentionWindow = asRecord(progressRecord.attentionWindow);
    const allowedActions = arrayOfStrings(progressRecord.allowedActionKeys);
    const runId = stringField(progressRecord.runId);
    const source = stringField(attentionWindow?.source);
    const deadlineAt = stringField(attentionWindow?.deadlineAt);
    const thresholdMinutes = stringValue(attentionWindow?.thresholdMinutes);
    const remainingMinutes = stringValue(attentionWindow?.remainingMinutes);
    const hintsText = arrayOfStrings(attentionWindow?.hints).join("; ");
    const wrapSupported = allowedActions.includes("pause_and_summarize");

    if (source === "time_box" && !wrapSupported) {
      const parts = [
        "HeadsDown box warning: a self-declared local box deadline is active. Keep scope tight before the deadline; the box will not stop work automatically when it passes. Use /headsdown:timebox clear to clear it or /headsdown:timebox <duration> to replace it.",
      ];
      appendLabeled(parts, "Deadline", deadlineAt);
      appendLabeled(parts, "Remaining minutes", remainingMinutes);
      appendLabeled(parts, "Warning threshold minutes", thresholdMinutes);
      appendLabeled(parts, "Current box hints", hintsText);
      contexts.push(parts.join(" "));
      if (toolType === "write") {
        message +=
          " Box deadline is near. Use /headsdown:timebox clear to clear it or /headsdown:timebox <duration> to replace it.";
      }
    } else {
      const parts = [
        "HeadsDown call: Window closing. Do not autonomously call headsdown_apply_action with action_key pause_and_summarize for this call. The user must invoke /headsdown:wrap explicitly. Session timebox extension requests are handled only by the session timebox prompt.",
      ];

      if (runId) {
        parts.push(`Target run_id: ${runId}.`);
      } else {
        parts.push(
          "If run_id is missing, call headsdown_status to re-establish the target run before applying actions.",
        );
      }
      if (wrapSupported) parts.push("Wrap action is currently allowed.");
      if (source === "time_box") parts.push("Active box deadline is driving this warning.");
      appendLabeled(parts, "Deadline", deadlineAt);
      appendLabeled(parts, "Remaining minutes", remainingMinutes);
      appendLabeled(parts, "Warning threshold minutes", thresholdMinutes);
      appendLabeled(parts, "Current wrap-up hints", hintsText);
      contexts.push(parts.join(" "));

      if (toolType === "write") {
        message +=
          " Window closing is active. Use /headsdown:wrap to pause and summarize if you want to stop here.";
      }
    }
  }

  const sessionTimeboxContext = await buildSessionTimeboxPromptContext(progressRecord, sessionId);
  if (sessionTimeboxContext) {
    contexts.push(sessionTimeboxContext);
    if (toolType === "write") {
      message +=
        " Session timebox is closing. Ask whether to request 15 minutes, request 30 minutes, or wrap up.";
    }
  }

  appendWarning(contexts, progressRecord, "timeBoxError", (value) => {
    if (toolType === "write") {
      message +=
        " HeadsDown box state could not be read. Use /headsdown:timebox clear or /headsdown:timebox <duration> to replace it.";
    }
    return `HeadsDown box state warning: ${value}. Use /headsdown:timebox clear to clear local box state or /headsdown:timebox <duration> to replace it.`;
  });

  appendWarning(
    contexts,
    progressRecord,
    "availabilityError",
    (value) =>
      `HeadsDown availability warning: ${value} Attention-window guidance may be incomplete until the next successful status check.`,
  );
  appendWarning(
    contexts,
    progressRecord,
    "progressReportError",
    (value) =>
      `HeadsDown progress telemetry warning: ${value} Attention-window guidance is still available, but progress telemetry may be stale.`,
  );

  if (progress.error) {
    contexts.push(
      `HeadsDown progress command warning: ${progress.error} Attention-window guidance may be incomplete until the command succeeds.`,
    );
  }

  if (progressRecord && progressRecord.reported === false) {
    let warning = `HeadsDown progress reporting warning: ${stringField(progressRecord.message) || "progress reporting is unavailable."}`;
    const details = stringField(progressRecord.details);
    if (details) warning += ` Details: ${details}.`;
    contexts.push(warning);
  }

  const additionalContext = contexts.filter(Boolean).join(" ");

  if (emitSystemMessage && additionalContext) {
    return {
      systemMessage: message,
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext },
    };
  }
  if (emitSystemMessage) return { systemMessage: message };
  if (additionalContext)
    return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext } };
  return undefined;
}

function classifyTool(toolName: string): ToolType {
  if (["Read", "Grep", "Glob", "LS"].includes(toolName)) return "read";
  if (["Write", "Edit", "MultiEdit"].includes(toolName)) return "write";
  return "external";
}

async function runProgress(
  runner: CliRunner,
  toolType: ToolType,
  count: number,
): Promise<{ payload: unknown; error: string }> {
  const result = await runner(["report-progress", toolType, String(count)]);
  if (result.code !== 0) {
    return {
      payload: null,
      error: ["HeadsDown progress command failed.", result.stderr].filter(Boolean).join(" "),
    };
  }
  if (!result.stdout) return { payload: null, error: "" };
  try {
    return { payload: JSON.parse(result.stdout) as unknown, error: "" };
  } catch {
    return { payload: null, error: "HeadsDown progress command returned invalid JSON." };
  }
}

async function buildSessionTimeboxPromptContext(
  progressRecord: Record<string, unknown> | null,
  claudeSessionId: string,
): Promise<string | null> {
  const prompt = asRecord(progressRecord?.sessionTimeboxPrompt);
  if (!prompt || !boolField(prompt.active)) return null;

  const sessionId = stringField(prompt.sessionId);
  const fingerprint = stringField(prompt.fingerprint);
  if (!sessionId || !fingerprint) return null;

  const previousFingerprint = await readSessionTimeboxPromptFingerprint(claudeSessionId);
  if (previousFingerprint === fingerprint) return null;

  await writeSessionTimeboxPromptFingerprint(claudeSessionId, fingerprint);
  const remainingMinutes = stringValue(prompt.remainingMinutes);
  const thresholdMinutes = stringValue(prompt.thresholdMinutes);
  const parts = [
    "HeadsDown session timebox is closing. Ask the user with AskUserQuestion and exactly these choices: Request 15 minutes, Request 30 minutes, Wrap up.",
    `If the user chooses Request 15 minutes, call headsdown_session_timebox with action=request_extension, session_id=${sessionId}, requested_extension_minutes=15.`,
    `If the user chooses Request 30 minutes, call headsdown_session_timebox with action=request_extension, session_id=${sessionId}, requested_extension_minutes=30.`,
    "If the user chooses Wrap up or ignores the prompt, do not request an extension; wrap up cleanly when appropriate.",
    "Do not include prompts, transcript text, file paths, repo names, logs, code, or free-form reasons in the extension request.",
  ];
  appendLabeled(parts, "Remaining minutes", remainingMinutes);
  appendLabeled(parts, "Warning threshold minutes", thresholdMinutes);
  return parts.join(" ");
}

function appendLabeled(parts: string[], label: string, value: string): void {
  if (value) parts.push(`${label}: ${value}.`);
}

function appendWarning(
  contexts: string[],
  record: Record<string, unknown> | null,
  field: string,
  format: (value: string) => string,
): void {
  const value = stringField(record?.[field]);
  if (value) contexts.push(format(value));
}

function integerField(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function stringValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return stringField(value);
}
