import { assertPrivacySafe, type HeadsDownClient } from "@headsdown/sdk";
import type { DeferredDecisionResolutionKind } from "@headsdown/sdk";
import {
  deferredDecisionEntryFromEvent,
  summarizeWakeUpDigest,
  unresolvedDeferredEntries,
  type DeferredDecisionEntry,
} from "./autopilot/wake-up-digest.js";

export type DeferredToolAction = "list" | "view" | "approve" | "override" | "refine" | "dismiss";

export async function handleDeferredTool(client: HeadsDownClient, args: Record<string, unknown>) {
  const action = normalizeAction(args.action);
  const events = await client.listAgentRunEvents({ limit: normalizeLimit(args.latest) });
  const entries = unresolvedDeferredEntries(events);

  if (action === "list") return safeOutput({ entries, summary: summarizeWakeUpDigest(entries) });

  const decisionId = typeof args.decision_id === "string" ? args.decision_id.trim() : "";
  if (!decisionId) throw new Error("The 'decision_id' parameter is required for this action.");
  const entry = entries.find((candidate) => candidate.decisionId === decisionId);
  if (!entry) {
    if (hasResolvedEvent(events, decisionId))
      throw new Error("Deferred decision is already resolved.");
    if (findRecordedEntry(events, decisionId)) {
      throw new Error("Deferred decision is already surfaced or unavailable for resolution.");
    }
    throw new Error("Deferred decision not found.");
  }

  if (action === "view") return safeOutput({ entry });

  const resolutionKind = resolutionKindForAction(action);
  const result = await client
    .reportDeferredDecisionResolved(
      {
        runId: entry.runId,
        source: "claude_code",
        workspaceRef: "unknown",
        proposalRef: entry.runId,
        correlationId: entry.runId,
      },
      {
        decision_id: entry.decisionId,
        resolution_kind: resolutionKind,
        notes_bucket: notesBucketForAction(action),
      },
    )
    .catch(() => null);

  if (result?.ok !== true) throw new Error("Could not resolve deferred decision.");
  return safeOutput({ resolved: true, decisionId: entry.decisionId, resolutionKind });
}

function hasResolvedEvent(events: unknown[], decisionId: string): boolean {
  return events.some((event) => {
    const record = event as Record<string, unknown>;
    const payload =
      record.payload && typeof record.payload === "object"
        ? (record.payload as Record<string, unknown>)
        : {};
    return record.eventType === "deferred_decision.resolved" && payload.decision_id === decisionId;
  });
}

function findRecordedEntry(events: unknown[], decisionId: string): DeferredDecisionEntry | null {
  for (const event of events) {
    const entry = deferredDecisionEntryFromEvent(event as Record<string, unknown>);
    if (entry?.decisionId === decisionId) return entry;
  }
  return null;
}

function normalizeAction(value: unknown): DeferredToolAction {
  if (value === undefined || value === null || value === "") return "list";
  if (
    value === "view" ||
    value === "approve" ||
    value === "override" ||
    value === "refine" ||
    value === "dismiss" ||
    value === "list"
  ) {
    return value;
  }
  throw new Error("Invalid action for headsdown_deferred.");
}

function normalizeLimit(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.floor(value), 100)
    : 50;
}

function resolutionKindForAction(action: DeferredToolAction): DeferredDecisionResolutionKind {
  if (action === "approve") return "approved";
  if (action === "override") return "overridden";
  if (action === "refine") return "refined";
  return "dismissed";
}

function notesBucketForAction(action: DeferredToolAction) {
  if (action === "override") return "wrong_framing";
  if (action === "refine") return "needs_more_info";
  if (action === "dismiss") return "other";
  return undefined;
}

function safeOutput(value: Record<string, unknown>) {
  assertPrivacySafe(value);
  return value;
}
