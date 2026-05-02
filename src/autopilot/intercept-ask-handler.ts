import { HeadsDownClient, ProposalStateStore } from "@headsdown/sdk";
import type { ActorContext, HeadsDownClient as HeadsDownClientType } from "@headsdown/sdk";
import {
  getActiveRunStateForSession,
  upsertRunState,
  type AgentRunState,
} from "../agent-run-state.js";
import {
  buildLocalSessionSummary,
  buildSummaryInputFromRunState,
  decisionIdForDeferralKey,
  deferralKey,
  loadAutopilotDeferralConfig,
  questionCategoryForPattern,
  recordDeferredDecision,
  safeSummaryToken,
  type AutopilotDeferralConfig,
} from "./deferral.js";
import { AutopilotStateStore, type Mode } from "./state.js";

export interface AskUserQuestionHookInput {
  tool_name?: string;
  tool_input?: { questions?: unknown[] } | Record<string, unknown>;
  session_id?: string;
  [key: string]: unknown;
}

export interface InterceptAskResult {
  denied: boolean;
  recorded: boolean;
  skippedReason?: string;
  output?: Record<string, unknown>;
}

export interface InterceptAskHandlerOptions {
  now?: Date;
  client?: HeadsDownClientType;
  clientFactory?: () => Promise<HeadsDownClientType>;
  stateStore?: AutopilotStateStore;
  proposalStore?: ProposalStateStore;
  activeRunLoader?: (sessionId?: string) => Promise<AgentRunState | null>;
  configLoader?: () => Promise<AutopilotDeferralConfig>;
}

const DENY_REASON =
  "[HeadsDown autopilot] Defer this question to the deferred-decision queue and continue with what you can do. Do not call AskUserQuestion.";

export async function runInterceptAskFromStdin(): Promise<InterceptAskResult> {
  const raw = await readStdin();
  if (!raw.trim()) return { denied: false, recorded: false, skippedReason: "empty_input" };

  try {
    const result = await handleInterceptAsk(JSON.parse(raw));
    if (result.output) console.log(JSON.stringify(result.output));
    return result;
  } catch {
    return { denied: false, recorded: false, skippedReason: "invalid_input" };
  }
}

export async function handleInterceptAsk(
  input: AskUserQuestionHookInput,
  options: InterceptAskHandlerOptions = {},
): Promise<InterceptAskResult> {
  if (input.tool_name !== "AskUserQuestion") {
    return { denied: false, recorded: false, skippedReason: "not_ask_user_question" };
  }

  const config = await (options.configLoader ?? loadAutopilotDeferralConfig)();
  if (!config.enabled) return { denied: false, recorded: false, skippedReason: "disabled" };

  const stateStore = options.stateStore ?? new AutopilotStateStore();
  const client = await resolveClient(options).catch(() => null);
  if (!client) return { denied: false, recorded: false, skippedReason: "client_unavailable" };

  const now = options.now ?? new Date();
  const mode = await resolveMode({ client, stateStore, config, now }).catch(() => null);
  if (mode !== "offline" && !(mode === "limited" && config.includeLimitedMode)) {
    return { denied: false, recorded: false, skippedReason: "not_autopilot" };
  }

  const sessionId =
    typeof input.session_id === "string" ? input.session_id : process.env.CLAUDE_SESSION_ID;
  const activeRun = await (options.activeRunLoader ?? getActiveRunStateForSession)(sessionId).catch(
    () => null,
  );
  const latestProposalRef =
    activeRun?.proposalId ?? (await latestApprovedProposalRef(options.proposalStore));
  const runId = activeRun?.runId ?? latestProposalRef ?? safeSummaryToken(sessionId ?? "default");
  const questionCount = extractQuestionCount(input.tool_input);
  const patternKey = "ask_user_question";
  const localQuestionFingerprint = buildLocalQuestionFingerprint(input.tool_input);
  const seenKey = deferralKey({
    runId,
    turnIndex: questionCount,
    patternKey,
    message: `ask_user:${questionCount}:${localQuestionFingerprint}`,
  });
  const currentState = await stateStore.load();

  let recorded = false;
  let skippedReason: string | undefined;

  if (currentState.lastSeenDeferralKey !== seenKey) {
    const decisionId = decisionIdForDeferralKey(seenKey);
    const sequence = (activeRun?.sequence ?? 0) + currentState.deferredDecisionCount + 1;
    const localSessionSummary = buildLocalSessionSummary(
      buildSummaryInputFromRunState({
        sessionId,
        runState: activeRun,
        approvedProposalRef: latestProposalRef,
        deferredDecisionCount: currentState.deferredDecisionCount + 1,
        continuationArtifactAvailable: false,
        now,
      }),
    );

    recorded = await recordDeferredDecision(client, {
      runId,
      sequence,
      proposalRef: latestProposalRef ? safeSummaryToken(latestProposalRef) : runId,
      patternKey,
      urgencyBucket: "normal",
      flagForReview: false,
      localSessionSummary,
      decisionId,
      idempotencyKey: `${runId}:deferred_decision.recorded:${decisionId}`,
    });

    if (recorded) {
      if (activeRun) {
        await upsertRunState(activeRun.runId, (current) => ({
          ...(current ?? activeRun),
          sequence,
        })).catch(() => undefined);
      }
      await stateStore.update((state) => ({
        ...state,
        deferredDecisionCount: state.deferredDecisionCount + 1,
        lastSeenDeferralKey: seenKey,
      }));
    } else {
      skippedReason = "record_failed";
    }
  } else {
    skippedReason = "duplicate";
  }

  if (skippedReason === "record_failed") {
    return { denied: false, recorded: false, skippedReason };
  }

  return { denied: true, recorded, skippedReason, output: denyOutput() };
}

function denyOutput(): Record<string, unknown> {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: DENY_REASON,
    },
  };
}

async function resolveClient(options: InterceptAskHandlerOptions): Promise<HeadsDownClientType> {
  if (options.client) return options.client;
  if (options.clientFactory) return await options.clientFactory();

  const client = await HeadsDownClient.fromCredentials();
  const actorContext: ActorContext = {
    source: "claude-code",
    agentId: "claude-code:autopilot-intercept-ask",
    sessionId: process.env.CLAUDE_SESSION_ID,
    workspaceRef: "unknown",
  };
  return client.withActor(actorContext);
}

async function resolveMode(input: {
  client: HeadsDownClientType;
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

async function latestApprovedProposalRef(store?: ProposalStateStore): Promise<string | null> {
  try {
    const proposal = await (store ?? new ProposalStateStore()).getLatestApproved();
    return proposal?.id ?? null;
  } catch {
    return null;
  }
}

function buildLocalQuestionFingerprint(toolInput: unknown): string {
  try {
    return JSON.stringify(toolInput ?? null).slice(0, 2000);
  } catch {
    return "unserializable";
  }
}

function extractQuestionCount(toolInput: unknown): number {
  const record =
    toolInput && typeof toolInput === "object" ? (toolInput as Record<string, unknown>) : {};
  const questions = record.questions;
  return Array.isArray(questions) ? questions.length : 0;
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

export function __privateForTests() {
  return { DENY_REASON, questionCategoryForPattern };
}
