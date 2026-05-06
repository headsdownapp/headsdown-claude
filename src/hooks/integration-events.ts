import { createHash } from "node:crypto";
import { HeadsDownClient, type HeadsDownClient as HeadsDownClientType } from "@headsdown/sdk";
import { getActiveRunStateForSession, nextSequence, upsertRunState } from "../agent-run-state.js";
import { reportAgentRunEventCompat } from "../agent-run-reporter.js";
import { asRecord, parseJsonObject, stringField } from "./runtime.js";

const SAFE_SESSION_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,256}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
const TURN_FAILED_REASONS = new Set([
  "api_error",
  "timeout",
  "cancelled",
  "rate_limited",
  "unknown",
]);
const TOOL_FAILED_REASONS = new Set(["permission_denied", "execution_error", "timeout", "unknown"]);
const PERMISSION_DENIED_RESOLUTIONS = new Set(["user_denied", "auto_denied", "policy"]);
const WRITE_COMMANDS = new Set([
  "tee",
  "cp",
  "mv",
  "rm",
  "rmdir",
  "mkdir",
  "touch",
  "chmod",
  "chown",
  "ln",
  "install",
  "truncate",
  "dd",
  "patch",
]);
const GIT_WRITE_SUBCOMMANDS = new Set([
  "apply",
  "checkout",
  "restore",
  "reset",
  "clean",
  "merge",
  "rebase",
  "commit",
  "am",
  "cherry-pick",
  "pull",
  "stash",
]);
const PACKAGE_WRITE_SUBCOMMANDS = new Set([
  "install",
  "update",
  "add",
  "remove",
  "upgrade",
  "dedupe",
]);

type IntegrationClient = Pick<HeadsDownClientType, "reportAgentRunEvent">;

export async function permissionDeniedHandler(
  input: string,
  client?: IntegrationClient,
): Promise<void> {
  const hookInput = parseJsonObject(input);
  const toolName = toolNameFromHook(hookInput);
  const sessionId = sessionIdFromHook(hookInput);
  const decisionId = opaqueId("decision", [
    sessionId,
    toolName,
    stringField(hookInput.tool_use_id) || stringField(hookInput.toolUseId),
  ]);
  const resolution = enumValue(hookInput.resolution, PERMISSION_DENIED_RESOLUTIONS, "auto_denied");

  await reportActiveIntegrationEvent(client, {
    sessionId,
    eventType: "integration.permission_denied",
    idempotencySuffix: `permission_denied:${decisionId}`,
    payload: {
      decision_id: decisionId,
      session_id: sessionId,
      action_kind_bucket: actionKindBucket(toolName, hookInput),
      resolution,
    },
  });
}

export async function stopFailureHandler(input: string, client?: IntegrationClient): Promise<void> {
  const hookInput = parseJsonObject(input);
  const sessionId = sessionIdFromHook(hookInput);
  const turnId = opaqueId("turn", [
    sessionId,
    stringField(hookInput.turn_id) || stringField(hookInput.turnId) || eventFingerprint(input),
  ]);
  const reason = reasonBucket(hookInput, TURN_FAILED_REASONS, "unknown");

  await reportActiveIntegrationEvent(client, {
    sessionId,
    eventType: "integration.turn_failed",
    idempotencySuffix: `turn_failed:${turnId}`,
    payload: {
      turn_id: turnId,
      session_id: sessionId,
      reason,
    },
  });
}

export async function postToolUseFailureHandler(
  input: string,
  client?: IntegrationClient,
): Promise<void> {
  const hookInput = parseJsonObject(input);
  const sessionId = sessionIdFromHook(hookInput);
  const toolName = toolNameFromHook(hookInput);
  const toolId = opaqueId("tool", [
    sessionId,
    toolName,
    stringField(hookInput.tool_use_id) ||
      stringField(hookInput.toolUseId) ||
      eventFingerprint(input),
  ]);
  const turnId = optionalOpaqueId("turn", [
    sessionId,
    stringField(hookInput.turn_id) || stringField(hookInput.turnId),
  ]);
  const reason = reasonBucket(hookInput, TOOL_FAILED_REASONS, "execution_error");

  await reportActiveIntegrationEvent(client, {
    sessionId,
    eventType: "integration.tool_failed",
    idempotencySuffix: `tool_failed:${toolId}`,
    payload: {
      tool_id: toolId,
      session_id: sessionId,
      ...(turnId ? { turn_id: turnId } : {}),
      reason,
    },
  });
}

export function isBashWriteLikeCommand(command: string): boolean {
  const normalized = command.trim();
  if (!normalized) return false;
  if (hasUnquotedRedirection(normalized)) return true;

  return shellCommandSegments(normalized).some((segment) => segmentIsWriteLike(segment));
}

export function bashWriteTargetCandidates(command: string): string[] {
  const targets = new Set<string>();

  for (const target of redirectionTargets(command)) targets.add(target);

  for (const segment of shellCommandSegments(command)) {
    const tokens = tokenizeShellSegment(segment);
    const commandIndex = commandTokenIndex(tokens);
    if (commandIndex < 0) continue;

    const commandName = tokens[commandIndex];
    const args = tokens.slice(commandIndex + 1);
    if (WRITE_COMMANDS.has(commandName)) {
      for (const arg of args) {
        if (!arg.startsWith("-")) targets.add(arg);
      }
    }
  }

  return [...targets].filter((target) => target && !target.startsWith("-"));
}

export function isWriteCapableHookTool(hookInput: Record<string, unknown>): boolean {
  const toolName = toolNameFromHook(hookInput);
  const toolInput = asRecord(hookInput.tool_input) ?? asRecord(hookInput.toolInput);
  if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(toolName)) return true;
  if (toolName === "unknown" && hasFileTarget(toolInput)) return true;
  if (toolName !== "Bash") return false;

  const command = stringField(toolInput?.command) || stringField(toolInput?.cmd);
  return isBashWriteLikeCommand(command);
}

async function reportActiveIntegrationEvent(
  client: IntegrationClient | undefined,
  input: {
    sessionId: string;
    eventType: string;
    idempotencySuffix: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const activeRun = await getActiveRunStateForSession(input.sessionId);
    if (!activeRun) {
      process.stderr.write("[HeadsDown] Integration failure signal skipped: no active run.\n");
      return;
    }

    const stateForEvent = nextSequence(activeRun);
    const reportingClient = client ?? (await HeadsDownClient.fromCredentials());
    const ok = await reportAgentRunEventCompat(reportingClient as HeadsDownClientType, {
      runId: stateForEvent.runId,
      eventType: input.eventType,
      sequence: stateForEvent.sequence,
      idempotencyKey: `${stateForEvent.runId}:${input.eventType}:${stateForEvent.sequence}:${input.idempotencySuffix}`,
      correlationId: stateForEvent.proposalId,
      proposalRef: stateForEvent.proposalId,
      payload: input.payload,
    });

    if (!ok) return;

    await upsertRunState(activeRun.runId, (current) => {
      const base = current ?? activeRun;
      return {
        ...base,
        sequence: Math.max(base.sequence, stateForEvent.sequence),
        failureCount: base.failureCount + failureIncrement(input.eventType),
      };
    });
  } catch {
    process.stderr.write(
      "[HeadsDown] Integration failure signal skipped: reporting unavailable.\n",
    );
  }
}

function failureIncrement(eventType: string): number {
  return eventType === "integration.tool_failed" || eventType === "integration.turn_failed" ? 1 : 0;
}

function sessionIdFromHook(hookInput: Record<string, unknown>): string {
  const value =
    stringField(hookInput.session_id) ||
    stringField(hookInput.sessionId) ||
    process.env.CLAUDE_SESSION_ID ||
    "default";
  return SAFE_SESSION_ID_PATTERN.test(value) ? value : "default";
}

function toolNameFromHook(hookInput: Record<string, unknown>): string {
  return stringField(hookInput.tool_name) || stringField(hookInput.toolName) || "unknown";
}

function hasFileTarget(toolInput: Record<string, unknown> | null): boolean {
  return Boolean(
    stringField(toolInput?.file_path) ||
    stringField(toolInput?.path) ||
    stringField(toolInput?.filePath),
  );
}

function actionKindBucket(toolName: string, hookInput: Record<string, unknown>): string {
  if (toolName === "Bash") {
    const toolInput = asRecord(hookInput.tool_input) ?? asRecord(hookInput.toolInput);
    const command = stringField(toolInput?.command) || stringField(toolInput?.cmd);
    return isBashWriteLikeCommand(command) ? "shell_destructive" : "shell_other";
  }
  if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(toolName)) return "file_write";
  return "tool_action";
}

function reasonBucket(
  hookInput: Record<string, unknown>,
  allowed: Set<string>,
  fallback: string,
): string {
  const candidates = [
    stringField(hookInput.reason),
    stringField(hookInput.error_type),
    stringField(hookInput.errorType),
    stringField(hookInput.failure_reason),
    stringField(hookInput.failureReason),
  ].map((value) => value.toLowerCase());

  for (const candidate of candidates) {
    if (allowed.has(candidate)) return candidate;
    if (/(^|\W)permission(\W|$)/.test(candidate))
      return allowed.has("permission_denied") ? "permission_denied" : fallback;
    if (/(^|\W)(timeout|timed_out)(\W|$)/.test(candidate)) return "timeout";
    if (/(^|\W)rate[_ -]?limited(\W|$)/.test(candidate))
      return allowed.has("rate_limited") ? "rate_limited" : fallback;
    if (/(^|\W)cancelled?(\W|$)/.test(candidate))
      return allowed.has("cancelled") ? "cancelled" : fallback;
    if (/(^|\W)api[_ -]?error(\W|$)/.test(candidate))
      return allowed.has("api_error") ? "api_error" : fallback;
  }

  return fallback;
}

function enumValue(value: unknown, allowed: Set<string>, fallback: string): string {
  const candidate = stringField(value).toLowerCase();
  return allowed.has(candidate) ? candidate : fallback;
}

function segmentIsWriteLike(segment: string): boolean {
  const tokens = tokenizeShellSegment(segment);
  const index = commandTokenIndex(tokens);
  if (index < 0) return false;

  const commandName = tokens[index];
  const args = tokens.slice(index + 1);
  if (WRITE_COMMANDS.has(commandName)) return true;
  if (commandName === "git") return GIT_WRITE_SUBCOMMANDS.has(args[0] ?? "");
  if (["npm", "pnpm", "yarn"].includes(commandName)) {
    if (PACKAGE_WRITE_SUBCOMMANDS.has(args[0] ?? "")) return true;
    return args[0] === "run" && args[1] === "build";
  }
  if (commandName === "python" && args[0] === "-m" && args[1] === "pip") {
    return args[2] === "install";
  }
  if (["sed", "perl", "ruby", "python", "node"].includes(commandName)) {
    return args.includes("-i") || args.some((arg) => arg.startsWith("-i"));
  }
  return false;
}

function commandTokenIndex(tokens: string[]): number {
  let index = 0;
  while (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(tokens[index] ?? "")) index += 1;
  while (["sudo", "env", "command"].includes(tokens[index] ?? "")) index += 1;
  return index < tokens.length ? index : -1;
}

function shellCommandSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | "" = "";

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    const next = command[index + 1];
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";" || char === "\n" || char === "|" || char === "&") {
      if (current.trim()) segments.push(current.trim());
      current = "";
      if ((char === "|" || char === "&") && next === char) index += 1;
      continue;
    }
    current += char;
  }

  if (current.trim()) segments.push(current.trim());
  return segments;
}

function tokenizeShellSegment(segment: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | "" = "";

  for (const char of segment) {
    if (quote) {
      if (char === quote) quote = "";
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}

function hasUnquotedRedirection(command: string): boolean {
  return redirectionTargets(command).length > 0;
}

function redirectionTargets(command: string): string[] {
  const targets: string[] = [];
  let quote: "'" | '"' | "" = "";

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char !== ">") continue;

    const rest = command.slice(command[index + 1] === ">" ? index + 2 : index + 1).trimStart();
    if (!rest || rest.startsWith("&") || rest.startsWith("|")) continue;
    const [target] = tokenizeShellSegment(rest);
    if (target) targets.push(target);
  }

  return targets;
}

function opaqueId(prefix: string, parts: string[]): string {
  const safePart = parts.find((part) => SAFE_ID_PATTERN.test(part));
  if (safePart && safePart.startsWith(`${prefix}_`)) return safePart;

  const digest = createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex");
  return `${prefix}_${digest.slice(0, 16)}`;
}

function optionalOpaqueId(prefix: string, parts: string[]): string | undefined {
  if (!parts.some(Boolean)) return undefined;
  return opaqueId(prefix, parts);
}

function eventFingerprint(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}
