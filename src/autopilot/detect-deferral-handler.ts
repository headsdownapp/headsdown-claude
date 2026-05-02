import { open, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { HeadsDownClient, ProposalStateStore } from "@headsdown/sdk";
import type { ActorContext } from "@headsdown/sdk";
import { getActiveRunStateForSession, upsertRunState } from "../agent-run-state.js";
import { evaluateAntiStuck } from "./anti-stuck.js";
import { claudeCodeIntegrationCapabilities } from "./integration-capabilities.js";
import type { AgentRunState } from "../agent-run-state.js";
import {
  buildLocalSessionSummary,
  buildSummaryInputFromRunState,
  decisionIdForDeferralKey,
  deferralKey,
  loadAutopilotDeferralConfig,
  recordDeferredDecision,
  safeSummaryToken,
  shouldRecordAutopilotDeferral,
  type AutopilotDeferralConfig,
} from "./deferral.js";
import { loadFreshAutopilotPolicy } from "./policy.js";
import { AutopilotStateStore, type AutopilotState, type Mode } from "./state.js";

export interface StopHookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  [key: string]: unknown;
}

export interface DetectDeferralResult {
  recorded: boolean;
  skippedReason?: string;
  matchedPattern?: string;
  duplicate?: boolean;
  stderr?: string;
  exitCode?: number;
}

export interface DetectDeferralHandlerOptions {
  now?: Date;
  client?: HeadsDownClient;
  clientFactory?: () => Promise<HeadsDownClient>;
  stateStore?: AutopilotStateStore;
  proposalStore?: ProposalStateStore;
  activeRunLoader?: (sessionId?: string) => Promise<AgentRunState | null>;
  configLoader?: () => Promise<AutopilotDeferralConfig>;
  continuationPath?: string;
}

interface LastAssistantTurn {
  message: string;
  turnIndex: number;
}

const MAX_TRANSCRIPT_TAIL_BYTES = 1024 * 1024;

export async function runDetectDeferralFromStdin(): Promise<DetectDeferralResult> {
  const raw = await readStdin();
  if (!raw.trim()) return { recorded: false, skippedReason: "empty_input" };

  try {
    const result = await handleDetectDeferral(JSON.parse(raw));
    if (result.stderr) console.error(result.stderr);
    if (result.exitCode && result.exitCode !== 0) process.exit(result.exitCode);
    return result;
  } catch {
    return { recorded: false, skippedReason: "invalid_input" };
  }
}

export async function handleDetectDeferral(
  input: StopHookInput,
  options: DetectDeferralHandlerOptions = {},
): Promise<DetectDeferralResult> {
  const transcriptPath = typeof input.transcript_path === "string" ? input.transcript_path : null;
  if (!transcriptPath) return { recorded: false, skippedReason: "missing_transcript" };

  const config = await (options.configLoader ?? loadAutopilotDeferralConfig)();
  if (!config.enabled) return { recorded: false, skippedReason: "disabled" };

  const stateStore = options.stateStore ?? new AutopilotStateStore();
  const client = await resolveClient(options).catch(() => null);
  if (!client) return { recorded: false, skippedReason: "client_unavailable" };

  const now = options.now ?? new Date();
  const mode = await resolveMode({ client, stateStore, config, now }).catch(() => null);
  if (!mode) return { recorded: false, skippedReason: "mode_unavailable" };

  const lastTurn = await readLastAssistantTurn(transcriptPath).catch(() => null);
  if (!lastTurn || !lastTurn.message.trim()) {
    return { recorded: false, skippedReason: "no_assistant_message" };
  }

  const detection = shouldRecordAutopilotDeferral({
    message: lastTurn.message,
    mode,
    config,
  });
  if (!detection.matched || !detection.pattern) {
    return { recorded: false, skippedReason: "no_match" };
  }

  const sessionId =
    typeof input.session_id === "string" ? input.session_id : process.env.CLAUDE_SESSION_ID;
  const activeRun = await (options.activeRunLoader ?? getActiveRunStateForSession)(sessionId).catch(
    () => null,
  );
  const runId = safeEventToken(activeRun?.runId ?? sessionId ?? "default");
  const seenKey = deferralKey({
    runId,
    turnIndex: lastTurn.turnIndex,
    patternKey: detection.pattern,
    message: lastTurn.message,
  });
  const currentState = await stateStore.load();

  if (currentState.lastSeenDeferralKey === seenKey) {
    return {
      recorded: false,
      skippedReason: "duplicate",
      matchedPattern: detection.pattern,
      duplicate: true,
    };
  }

  const approvedProposalRef =
    activeRun?.proposalId ?? (await latestApprovedProposalRef(options.proposalStore));
  const eventRunId = activeRun?.runId ?? approvedProposalRef ?? runId;
  const sequence = (activeRun?.sequence ?? 0) + currentState.deferredDecisionCount + 1;
  const decisionId = decisionIdForDeferralKey(seenKey);
  const localSessionSummary = buildLocalSessionSummary(
    buildSummaryInputFromRunState({
      sessionId,
      runState: activeRun,
      approvedProposalRef,
      deferredDecisionCount: currentState.deferredDecisionCount + 1,
      continuationArtifactAvailable: await continuationArtifactExists(options.continuationPath),
      now,
    }),
  );

  const recorded = await recordDeferredDecision(client, {
    runId: eventRunId,
    sequence,
    proposalRef: approvedProposalRef ? safeSummaryToken(approvedProposalRef) : eventRunId,
    patternKey: detection.pattern,
    urgencyBucket: detection.urgencyBucket,
    flagForReview: detection.urgencyBucket === "high",
    localSessionSummary,
    decisionId,
    idempotencyKey: `${eventRunId}:deferred_decision.recorded:${decisionId}`,
  });

  if (!recorded)
    return { recorded: false, skippedReason: "record_failed", matchedPattern: detection.pattern };

  if (activeRun) {
    await upsertRunState(activeRun.runId, (current) => ({
      ...(current ?? activeRun),
      sequence,
    })).catch(() => undefined);
  }

  const policyLoad = await loadFreshAutopilotPolicy({ client, mode, config });
  if (policyLoad.active && !policyLoad.policy) {
    console.error(
      "[HeadsDown autopilot] Hosted autopilot policy unavailable; using local fallback policy for this anti-stuck nudge.",
    );
  }
  const antiStuck = evaluateAntiStuck({
    stopHookInput: input,
    mode,
    policy: policyLoad.policy,
    capabilities: claudeCodeIntegrationCapabilities(now),
    matchedPattern: detection.pattern,
    autopilotState: currentState,
    config,
    runId: eventRunId,
    toolCallCount: activeRun?.toolCallsCount ?? 0,
    now,
  });

  await stateStore.update((state) => ({
    ...(antiStuck.shouldNudge ? antiStuck.updatedState : state),
    deferredDecisionCount: state.deferredDecisionCount + 1,
    lastSeenDeferralKey: seenKey,
  }));

  if (antiStuck.shouldNudge) {
    return {
      recorded: true,
      matchedPattern: detection.pattern,
      stderr: antiStuck.nudgeText,
      exitCode: 2,
    };
  }

  return { recorded: true, matchedPattern: detection.pattern };
}

export async function readLastAssistantTurn(path: string): Promise<LastAssistantTurn | null> {
  const text = await readTranscriptTail(path);
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const candidate = extractAssistantTurn(parsed, index);
      if (candidate) return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

export function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const record = message as Record<string, unknown>;
  const content = record.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const partRecord = part as Record<string, unknown>;
      return typeof partRecord.text === "string" ? partRecord.text : "";
    })
    .filter((part) => part.length > 0)
    .join("\n");
}

async function resolveClient(options: DetectDeferralHandlerOptions): Promise<HeadsDownClient> {
  if (options.client) return options.client;
  if (options.clientFactory) return await options.clientFactory();

  const client = await HeadsDownClient.fromCredentials();
  const actorContext: ActorContext = {
    source: "claude-code",
    agentId: "claude-code:autopilot-detect-deferral",
    sessionId: process.env.CLAUDE_SESSION_ID,
    workspaceRef: "unknown",
  };
  return client.withActor(actorContext);
}

async function resolveMode(input: {
  client: HeadsDownClient;
  stateStore: AutopilotStateStore;
  config: AutopilotDeferralConfig;
  now: Date;
}): Promise<Mode | null> {
  const state = await input.stateStore.load();
  const nowMs = input.now.getTime();
  if (
    state.modeCachedAt !== null &&
    state.modeCacheValue !== null &&
    nowMs - state.modeCachedAt < input.config.modeCacheMs
  ) {
    return state.modeCacheValue;
  }

  const availability = await input.client.getAvailability();
  const mode = normalizeMode((availability as { contract?: { mode?: unknown } }).contract?.mode);
  await input.stateStore.update((current) => ({
    ...current,
    lastObservedMode: mode,
    modeCachedAt: nowMs,
    modeCacheValue: mode,
  }));
  return mode;
}

function extractAssistantTurn(
  record: Record<string, unknown>,
  fallbackTurnIndex: number,
): LastAssistantTurn | null {
  const nestedMessage =
    record.message && typeof record.message === "object" ? record.message : null;
  const message = (nestedMessage ?? record) as Record<string, unknown>;
  const role = typeof message.role === "string" ? message.role : record.type;
  if (role !== "assistant") return null;

  const text = extractAssistantText(message);
  if (!text.trim()) return null;

  const rawTurnIndex =
    record.turnIndex ?? record.turn_index ?? message.turnIndex ?? message.turn_index;
  const turnIndex =
    typeof rawTurnIndex === "number" && Number.isInteger(rawTurnIndex) && rawTurnIndex >= 0
      ? rawTurnIndex
      : fallbackTurnIndex;

  return { message: text, turnIndex };
}

async function readTranscriptTail(path: string): Promise<string> {
  const file = await open(path, "r");
  try {
    const stats = await file.stat();
    const length = Math.min(stats.size, MAX_TRANSCRIPT_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, Math.max(0, stats.size - length));
    return buffer.toString("utf-8");
  } finally {
    await file.close();
  }
}

async function latestApprovedProposalRef(store?: ProposalStateStore): Promise<string | null> {
  try {
    const proposal = await (store ?? new ProposalStateStore()).getLatestApproved();
    return proposal?.id ?? null;
  } catch {
    return null;
  }
}

async function continuationArtifactExists(path = defaultContinuationPath()): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function defaultContinuationPath(): string {
  const override = process.env.HEADSDOWN_CONTINUATION_PATH?.trim();
  if (override) return override;
  return join(homedir(), ".config", "headsdown", "continuation.json");
}

function safeEventToken(value: string): string {
  return /^[A-Za-z0-9_.:-]{1,256}$/.test(value) ? value : safeSummaryToken(value);
}

function normalizeMode(value: unknown): Mode | null {
  return typeof value === "string" && value.trim() ? (value.trim() as Mode) : null;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export function __privateForTests(input: { state: AutopilotState }): AutopilotState {
  return input.state;
}
