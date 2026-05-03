import { bucketFileCount, bucketScopeGrowth } from "@headsdown/sdk/agent";
import type { AgentRunState, RunTerminalOutcome } from "./agent-run-state.js";

export function bucketMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes < 0) return "unknown";
  if (minutes < 15) return "under_15";
  if (minutes <= 30) return "15_to_30";
  if (minutes <= 60) return "30_to_60";
  if (minutes <= 120) return "60_to_120";
  return "over_120";
}

export function mapOutcomeToTaxonomy(
  outcome: RunTerminalOutcome,
): "succeeded" | "failed" | "cancelled" | "paused" {
  switch (outcome) {
    case "completed":
      return "succeeded";
    case "failed":
    case "timed_out":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "partially_completed":
      return "paused";
  }
}

export function startedPayload(input: {
  estimatedFiles?: number | null;
  estimatedMinutes?: number | null;
}): Record<string, unknown> {
  return {
    task_category: "coding_agent_change",
    task_size_bucket:
      typeof input.estimatedMinutes === "number" && input.estimatedMinutes > 60
        ? "medium"
        : "small",
    started_by: "agent",
    initial_call_key: "good_to_run",
    estimated_minutes_bucket: bucketMinutes(input.estimatedMinutes),
    estimated_files_bucket: bucketFileCount(input.estimatedFiles ?? undefined),
    delivery_mode: "auto",
  };
}

export function progressPayload(state: AgentRunState, now = new Date()): Record<string, unknown> {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(state.startedAt).getTime()) / 1000),
  );
  const scopeChanged =
    typeof state.estimatedFiles === "number" &&
    state.estimatedFiles > 0 &&
    typeof state.filesModifiedCount === "number"
      ? state.filesModifiedCount > state.estimatedFiles
      : false;

  return {
    elapsedSeconds,
    toolCallsCount: state.toolCallsCount,
    toolReadCount: state.toolReadCount,
    toolWriteCount: state.toolWriteCount,
    toolExternalCount: state.toolExternalCount,
    filesReadBucket: "unknown",
    filesModifiedBucket: bucketFileCount(state.filesModifiedCount ?? undefined),
    validationLevel: "unknown",
    validationStatus: "unknown",
    retryCount: state.retryCount,
    failureCount: state.failureCount,
    scopeChanged,
    redirectCount: state.redirectCount,
    progressState: "working",
    scopeGrowthBucket: bucketScopeGrowth(state.filesModifiedCount ?? undefined),
    confidenceBucket: "medium",
    spendEstimateBucket: "unknown",
  };
}

export function buildTerminalEvent(
  state: AgentRunState,
  outcome: RunTerminalOutcome,
  input: {
    errorCategory?: string;
    testsPassed?: boolean;
    now?: Date;
  },
): { eventType: string; payload: Record<string, unknown> } {
  const now = input.now ?? new Date();
  const durationSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(state.startedAt).getTime()) / 1000),
  );
  const validationStatus =
    input.testsPassed === true ? "passed" : input.testsPassed === false ? "failed" : "unknown";

  if (outcome === "failed" || outcome === "timed_out") {
    return {
      eventType: "agent_run.failed",
      payload: {
        failure_category: normalizeFailureCategory(
          input.errorCategory ?? (outcome === "timed_out" ? "timeout" : "unknown"),
        ),
        duration_seconds: durationSeconds,
        recoverable: true,
        validation_status: validationStatus,
        tool_calls_count: state.toolCallsCount,
        handoff_saved: false,
      },
    };
  }

  if (outcome === "cancelled") {
    return {
      eventType: "agent_run.cancelled",
      payload: {
        cancelled_by: "agent",
        reason_code: "user_cancelled",
        duration_seconds: durationSeconds,
        handoff_saved: false,
      },
    };
  }

  return {
    eventType: "agent_run.completed",
    payload: {
      outcome: mapOutcomeToTaxonomy(outcome),
      completed_at: now.toISOString(),
      duration_seconds: durationSeconds,
      validation_status: validationStatus,
      files_touched_count: state.filesModifiedCount ?? undefined,
      tool_calls_count: state.toolCallsCount,
      failure_category: input.errorCategory
        ? normalizeFailureCategory(input.errorCategory)
        : undefined,
    },
  };
}

function normalizeFailureCategory(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 64);

  const allowed = new Set([
    "validation_failed",
    "compilation_error",
    "test_failure",
    "auth_error",
    "external_service_error",
    "timeout",
    "cancelled",
    "unknown",
  ]);

  return allowed.has(normalized) ? normalized : "unknown";
}
