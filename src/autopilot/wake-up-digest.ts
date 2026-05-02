import { assertPrivacySafe, type AgentRunEvent } from "@headsdown/sdk";

export type WakeUpTransition =
  | "first_observation"
  | "no_change"
  | "online_arrival"
  | "going_offline"
  | "still_offline"
  | "still_online";

export interface DeferredDecisionEntry {
  decisionId: string;
  runId: string;
  eventId: string;
  decisionKind: string;
  urgencyBucket: string;
  flaggedForReview: boolean;
  outcomeCategory: string | null;
  toolCallCount: number | null;
  fileChangeCount: number | null;
  deferredDecisionCount: number | null;
  timestamp: string;
}

export interface WakeUpDigestSummary {
  count: number;
  runIds: string[];
  flaggedCount: number;
  urgencyBuckets: Record<string, number>;
  outcomeCategoryBuckets: Record<string, number>;
  latestAt: string | null;
}

export function detectModeTransition(
  prev: string | null | undefined,
  curr: string | null | undefined,
): WakeUpTransition {
  const previous = normalizeMode(prev);
  const current = normalizeMode(curr);
  if (!previous && current) return "first_observation";
  if (previous === current) return isOnlineLike(current) ? "still_online" : "still_offline";
  if (!isOnlineLike(previous) && isOnlineLike(current)) return "online_arrival";
  if (isOnlineLike(previous) && !isOnlineLike(current)) return "going_offline";
  return "no_change";
}

export function shouldTriggerWakeUp(
  transition: WakeUpTransition,
  currentMode: string | null | undefined,
): boolean {
  return (
    transition === "online_arrival" ||
    (transition === "first_observation" && isOnlineLike(currentMode))
  );
}

export function deferredDecisionEntryFromEvent(
  event: AgentRunEvent | Record<string, unknown>,
): DeferredDecisionEntry | null {
  const record = event as Record<string, unknown>;
  const payload =
    record.payload && typeof record.payload === "object"
      ? (record.payload as Record<string, unknown>)
      : {};
  const summary =
    payload.local_session_summary && typeof payload.local_session_summary === "object"
      ? (payload.local_session_summary as Record<string, unknown>)
      : {};
  const decisionId = stringField(payload.decision_id);
  if (!decisionId) return null;

  return {
    decisionId,
    runId: stringField(record.runId) || "unknown",
    eventId: stringField(record.eventId) || decisionId,
    decisionKind: stringField(payload.decision_kind) || "unknown",
    urgencyBucket: stringField(payload.urgency_bucket) || "normal",
    flaggedForReview: payload.flagged_for_review === true,
    outcomeCategory: stringField(summary.outcomeCategory),
    toolCallCount: numberField(summary.toolCallCount),
    fileChangeCount: numberField(summary.fileChangeCount),
    deferredDecisionCount: numberField(summary.deferredDecisionCount),
    timestamp:
      stringField(record.occurredAt) || stringField(record.insertedAt) || new Date(0).toISOString(),
  };
}

export function summarizeWakeUpDigest(entries: DeferredDecisionEntry[]): WakeUpDigestSummary {
  const summary: WakeUpDigestSummary = {
    count: entries.length,
    runIds: [...new Set(entries.map((entry) => entry.runId))].sort(),
    flaggedCount: entries.filter((entry) => entry.flaggedForReview).length,
    urgencyBuckets: {},
    outcomeCategoryBuckets: {},
    latestAt: null,
  };

  for (const entry of entries) {
    summary.urgencyBuckets[entry.urgencyBucket] =
      (summary.urgencyBuckets[entry.urgencyBucket] ?? 0) + 1;
    if (entry.outcomeCategory) {
      summary.outcomeCategoryBuckets[entry.outcomeCategory] =
        (summary.outcomeCategoryBuckets[entry.outcomeCategory] ?? 0) + 1;
    }
    if (!summary.latestAt || entry.timestamp > summary.latestAt) summary.latestAt = entry.timestamp;
  }

  return summary;
}

export function formatWakeUpDigestInstruction(summary: WakeUpDigestSummary): string | null {
  if (summary.count === 0) return null;
  const decisionWord = summary.count === 1 ? "deferred decision" : "deferred decisions";
  const runWord = summary.runIds.length === 1 ? "run" : "runs";
  const text = [
    `[HeadsDown autopilot] ${summary.count} unresolved ${decisionWord} across ${summary.runIds.length} ${runWord} is ready to review.`,
    `Flagged for review: ${summary.flaggedCount}. Urgency buckets: ${formatBuckets(summary.urgencyBuckets)}. Outcome buckets: ${formatBuckets(summary.outcomeCategoryBuckets)}. Latest at: ${summary.latestAt ?? "unknown"}.`,
    "Use the headsdown_deferred tool to list, view, approve, override, refine, or dismiss entries. Show derived facts only. Do not render raw transcript text, prompts, file paths, terminal output, URLs, code snippets, or question text.",
  ].join(" ");
  assertPrivacySafe({ digest_instruction: text });
  return text;
}

export function unresolvedDeferredEntries(
  events: Array<AgentRunEvent | Record<string, unknown>>,
  surfacedDecisionIds: string[] = [],
): DeferredDecisionEntry[] {
  const resolved = new Set<string>();
  const surfaced = new Set(surfacedDecisionIds);
  const recorded: DeferredDecisionEntry[] = [];

  for (const event of events) {
    const record = event as Record<string, unknown>;
    const payload =
      record.payload && typeof record.payload === "object"
        ? (record.payload as Record<string, unknown>)
        : {};
    const decisionId = stringField(payload.decision_id);
    if (!decisionId) continue;
    if (record.eventType === "deferred_decision.resolved") resolved.add(decisionId);
    if (record.eventType === "deferred_decision.recorded") {
      const entry = deferredDecisionEntryFromEvent(record);
      if (entry) recorded.push(entry);
    }
  }

  return recorded.filter(
    (entry) => !resolved.has(entry.decisionId) && !surfaced.has(entry.decisionId),
  );
}

function formatBuckets(buckets: Record<string, number>): string {
  const entries = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "none";
  return entries.map(([key, value]) => `${key}:${value}`).join(", ");
}

function normalizeMode(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isOnlineLike(value: string | null | undefined): boolean {
  return value === "online" || value === "busy";
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
