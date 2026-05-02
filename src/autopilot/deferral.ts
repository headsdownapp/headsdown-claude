import { createHash, randomBytes } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { HeadsDownClient, LocalSessionSummary } from "@headsdown/sdk";
import {
  LOCAL_SESSION_SUMMARY_VERSION,
  assertLocalSessionSummary,
  assertPrivacySafe,
} from "@headsdown/sdk";
import { reportAgentRunEventCompat } from "../agent-run-reporter.js";
import type { AgentRunState } from "../agent-run-state.js";

export type AutopilotDeferralUrgencyBucket = "low" | "normal" | "high";
export type DeferredDecisionKind = "human_input_required";
export type DeferredDecisionCategory = "agent_question";

export interface DeferredDecisionRecordedPayload {
  decision_id: string;
  decision_kind: DeferredDecisionKind;
  decision_category: DeferredDecisionCategory;
  pattern_key: string;
  urgency_bucket: AutopilotDeferralUrgencyBucket;
  flagged_for_review: boolean;
  local_session_summary: LocalSessionSummary;
}

export interface AutopilotDeferralPattern {
  key: string;
  regex: RegExp;
  urgencyBucket?: AutopilotDeferralUrgencyBucket;
}

export interface AutopilotDeferralConfig {
  enabled: boolean;
  includeLimitedMode: boolean;
  defaultUrgencyBucket: AutopilotDeferralUrgencyBucket;
  modeCacheMs: number;
  patterns: AutopilotDeferralPattern[];
}

export interface LocalSessionSummaryInput {
  sessionId: string | null | undefined;
  approvedProposalRef: string | null;
  toolCallCount: number;
  fileChangeCount: number;
  deferredDecisionCount: number;
  continuationArtifactAvailable: boolean;
  validationLocallyPassed: boolean;
  outcomeCategory?: LocalSessionSummary["outcomeCategory"];
  stale?: boolean;
  now?: Date;
}

export const DEFAULT_DETECTION_PATTERNS: Array<{
  key: string;
  pattern: string;
  urgencyBucket?: AutopilotDeferralUrgencyBucket;
}> = [
  {
    key: "explicit_defer_marker",
    pattern: String.raw`\[(?:DEFER|NEEDS_USER|NEEDS_DECISION)\]`,
    urgencyBucket: "high",
  },
  {
    key: "should_i",
    pattern: String.raw`\bshould\s+i\b[^.!?]{0,160}\?`,
  },
  {
    key: "would_you_like",
    pattern: String.raw`\bwould\s+you\s+like\b`,
  },
  {
    key: "do_you_want",
    pattern: String.raw`\bdo\s+you\s+want\b`,
  },
  {
    key: "awaiting",
    pattern: String.raw`\b(?:awaiting|waiting\s+for)\s+(?:your|user|human)\b`,
  },
  {
    key: "let_me_know",
    pattern: String.raw`\blet\s+me\s+know\b`,
  },
  {
    key: "please_confirm",
    pattern: String.raw`\bplease\s+confirm\b`,
  },
  {
    key: "which_would_you_prefer",
    pattern: String.raw`\bwhich\s+would\s+you\s+prefer\b`,
  },
  {
    key: "trailing_second_person_question",
    pattern: String.raw`\b(?:you|your)\b[^.!?]{0,180}\?\s*$`,
  },
];

export function shouldRecordAutopilotDeferral(input: {
  message: string;
  mode: string | null | undefined;
  config: AutopilotDeferralConfig;
}): { matched: boolean; pattern: string | null; urgencyBucket: AutopilotDeferralUrgencyBucket } {
  if (!input.config.enabled) {
    return { matched: false, pattern: null, urgencyBucket: input.config.defaultUrgencyBucket };
  }

  if (input.mode !== "offline" && !(input.mode === "limited" && input.config.includeLimitedMode)) {
    return { matched: false, pattern: null, urgencyBucket: input.config.defaultUrgencyBucket };
  }

  for (const pattern of input.config.patterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(input.message)) {
      return {
        matched: true,
        pattern: pattern.key,
        urgencyBucket: pattern.urgencyBucket ?? input.config.defaultUrgencyBucket,
      };
    }
  }

  return { matched: false, pattern: null, urgencyBucket: input.config.defaultUrgencyBucket };
}

export function buildLocalSessionSummary(input: LocalSessionSummaryInput): LocalSessionSummary {
  const summary: LocalSessionSummary = {
    version: LOCAL_SESSION_SUMMARY_VERSION,
    sessionId: safeSummaryToken(input.sessionId || "default"),
    generatedAt: (input.now ?? new Date()).toISOString(),
    stale: input.stale ?? false,
    toolCallCount: clampCount(input.toolCallCount),
    fileChangeCount: clampCount(input.fileChangeCount),
    deferredDecisionCount: clampCount(input.deferredDecisionCount),
    continuationArtifactAvailable: Boolean(input.continuationArtifactAvailable),
    validationLocallyPassed: Boolean(input.validationLocallyPassed),
    approvedProposalRef: input.approvedProposalRef
      ? safeSummaryToken(input.approvedProposalRef)
      : null,
    outcomeCategory: input.outcomeCategory ?? "in_progress",
  };

  assertLocalSessionSummary(summary);
  return summary;
}

export async function recordDeferredDecision(
  client: HeadsDownClient,
  input: {
    runId: string;
    sequence?: number;
    proposalRef?: string | null;
    patternKey: string;
    urgencyBucket: AutopilotDeferralUrgencyBucket;
    flagForReview: boolean;
    localSessionSummary: LocalSessionSummary;
    decisionId?: string;
    idempotencyKey?: string;
  },
): Promise<boolean> {
  assertLocalSessionSummary(input.localSessionSummary);

  const decisionId = input.decisionId ?? `decision_${randomBytes(16).toString("hex")}`;
  const payload: DeferredDecisionRecordedPayload = {
    decision_id: decisionId,
    decision_kind: "human_input_required",
    decision_category: "agent_question",
    pattern_key: input.patternKey,
    urgency_bucket: input.urgencyBucket,
    flagged_for_review: input.flagForReview,
    local_session_summary: input.localSessionSummary,
  };

  assertPrivacySafe(payload, "payload");

  return await reportAgentRunEventCompat(client, {
    runId: input.runId,
    eventType: "deferred_decision.recorded",
    sequence: input.sequence ?? 0,
    idempotencyKey:
      input.idempotencyKey ?? `${input.runId}:deferred_decision.recorded:${decisionId}`,
    correlationId: input.runId,
    proposalRef: input.proposalRef ?? input.runId,
    payload: { ...payload },
  });
}

export async function loadAutopilotDeferralConfig(): Promise<AutopilotDeferralConfig> {
  const configPath = autopilotConfigPath();
  try {
    await access(configPath);
  } catch {
    return normalizeAutopilotDeferralConfig(null);
  }

  try {
    return normalizeAutopilotDeferralConfig(JSON.parse(await readFile(configPath, "utf-8")));
  } catch {
    return normalizeAutopilotDeferralConfig(null);
  }
}

export function normalizeAutopilotDeferralConfig(value: unknown): AutopilotDeferralConfig {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawPatterns = Array.isArray(raw.patterns) ? raw.patterns : [];
  const customPatterns = rawPatterns
    .map((entry, index) => normalizePattern(entry, index))
    .filter((pattern): pattern is AutopilotDeferralPattern => pattern !== null);
  const defaultPatterns = DEFAULT_DETECTION_PATTERNS.map((entry, index) =>
    normalizePattern(entry, index),
  ).filter((pattern): pattern is AutopilotDeferralPattern => pattern !== null);

  return {
    enabled: raw.enabled === false ? false : true,
    includeLimitedMode: raw.includeLimitedMode === true,
    defaultUrgencyBucket: normalizeUrgencyBucket(raw.defaultUrgencyBucket),
    modeCacheMs: normalizePositiveNumber(raw.modeCacheMs, 60_000),
    patterns: customPatterns.length > 0 ? customPatterns : defaultPatterns,
  };
}

export function safeSummaryToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "h_empty";
  return `h_${createHash("sha256").update(trimmed).digest("hex").slice(0, 40)}`;
}

export function deferralKey(input: {
  runId: string;
  turnIndex: number;
  patternKey: string;
  message: string;
}): string {
  const messageHash = createHash("sha1").update(input.message.slice(0, 2000)).digest("hex");
  const localHash = createHash("sha1")
    .update(`${input.turnIndex}:${input.patternKey}:${messageHash}`)
    .digest("hex");
  return `${safeSummaryToken(input.runId)}:${localHash}`;
}

export function decisionIdForDeferralKey(key: string): string {
  return `decision_${createHash("sha1").update(key).digest("hex").slice(0, 32)}`;
}

export function buildSummaryInputFromRunState(input: {
  sessionId: string | null | undefined;
  runState: AgentRunState | null;
  approvedProposalRef: string | null;
  deferredDecisionCount: number;
  continuationArtifactAvailable: boolean;
  now?: Date;
}): LocalSessionSummaryInput {
  return {
    sessionId: input.sessionId,
    approvedProposalRef: input.approvedProposalRef,
    toolCallCount: input.runState?.toolCallsCount ?? 0,
    fileChangeCount: input.runState?.filesModifiedCount ?? 0,
    deferredDecisionCount: input.deferredDecisionCount,
    continuationArtifactAvailable: input.continuationArtifactAvailable,
    validationLocallyPassed: false,
    outcomeCategory: "in_progress",
    now: input.now,
  };
}

export function autopilotConfigPath(): string {
  const override = process.env.HEADSDOWN_AUTOPILOT_CONFIG_PATH?.trim();
  if (override) return override;
  return join(homedir(), ".config", "headsdown", "autopilot-config.json");
}

function normalizePattern(entry: unknown, index: number): AutopilotDeferralPattern | null {
  const record = typeof entry === "string" ? { pattern: entry } : entry;
  if (!record || typeof record !== "object") return null;
  const raw = record as Record<string, unknown>;
  const pattern = typeof raw.pattern === "string" ? raw.pattern : null;
  if (!pattern || !pattern.trim()) return null;

  try {
    return {
      key: typeof raw.key === "string" && raw.key.trim() ? raw.key.trim() : `custom_${index + 1}`,
      regex: new RegExp(pattern, "im"),
      urgencyBucket: normalizeOptionalUrgencyBucket(raw.urgencyBucket),
    };
  } catch {
    return null;
  }
}

function normalizeUrgencyBucket(value: unknown): AutopilotDeferralUrgencyBucket {
  return value === "low" || value === "high" || value === "normal" ? value : "normal";
}

function normalizeOptionalUrgencyBucket(
  value: unknown,
): AutopilotDeferralUrgencyBucket | undefined {
  return value === "low" || value === "high" || value === "normal" ? value : undefined;
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), 1_000_000);
}
