import type { AgentControlOverviewView, AgentRunSummaryView } from "./agent-control.js";
import { normalizeHeadsDownCallKey } from "./headsdown-call-keys.js";
import { resolveEffectiveAttentionWindow, isWithinWarningWindow } from "./time-box.js";
import type { TimeBoxState } from "./time-box.js";

export interface ActiveRunRef {
  runId: string;
  proposalId: string;
}

export interface AttentionWindowState {
  deadlineAt: string | null;
  thresholdMinutes: number | null;
  remainingMinutes: number | null;
  hints: string[];
}

export interface CurrentRunContext {
  runId: string | null;
  proposalRef: string | null;
  callKey: string | null;
  allowedActionKeys: string[];
}

interface BaseReportProgressResponse {
  reported: true;
  runId: string | null;
  proposalRef: string | null;
  allowedActionKeys: string[];
}

export type ReportProgressResponse = BaseReportProgressResponse &
  (
    | {
        attentionWindowClosing: true;
        attentionWindow: AttentionWindowState;
      }
    | {
        attentionWindowClosing: false;
        attentionWindow: null;
      }
  );

export function buildReportProgressResponse(input: {
  activeRun: ActiveRunRef | null;
  overview: AgentControlOverviewView | null;
  wrapUpGuidance?: {
    deadlineAt?: string | null;
    thresholdMinutes?: number | null;
    remainingMinutes?: number | null;
    hints?: string[] | null;
  } | null;
  timeBox?: TimeBoxState | null;
  now?: Date;
}): ReportProgressResponse {
  const currentRun = resolveCurrentRunContext({
    activeRun: input.activeRun,
    overview: input.overview,
  });
  const base = {
    reported: true,
    runId: currentRun.runId,
    proposalRef: currentRun.proposalRef,
    allowedActionKeys: currentRun.allowedActionKeys,
  } satisfies BaseReportProgressResponse;

  const effectiveAttentionWindow = resolveEffectiveAttentionWindow({
    backend: input.wrapUpGuidance ?? null,
    timeBox: input.timeBox ?? null,
    now: input.now,
    forceTimeBoxWarning: currentRun.callKey === "attention_window_closing",
  });

  if (
    currentRun.callKey === "attention_window_closing" ||
    (effectiveAttentionWindow && isWithinWarningWindow(effectiveAttentionWindow))
  ) {
    return {
      ...base,
      attentionWindowClosing: true,
      attentionWindow: buildAttentionWindowState(effectiveAttentionWindow),
    };
  }

  return {
    ...base,
    attentionWindowClosing: false,
    attentionWindow: null,
  };
}

export function resolveCurrentRunContext(input: {
  activeRun: ActiveRunRef | null;
  overview: AgentControlOverviewView | null;
}): CurrentRunContext {
  const currentRun = resolveCurrentRun(input.activeRun, input.overview?.runSummaries ?? null);
  const overviewCall = input.overview?.headsdownCall ?? null;
  const callKey =
    normalizeHeadsDownCallKey(currentRun?.callKey) ?? resolveOverviewCallKey(overviewCall);
  const summaryActionKeys = normalizeActionKeys(currentRun?.allowedActionKeys ?? []);
  const overviewActionKeys = normalizeActionKeys(
    overviewCall?.allowedActionKeys && overviewCall.allowedActionKeys.length > 0
      ? overviewCall.allowedActionKeys
      : overviewCall?.allowedActionKnownKeys,
  );

  return {
    runId: currentRun?.runId ?? input.activeRun?.runId ?? null,
    proposalRef: input.activeRun?.proposalId ?? null,
    callKey,
    allowedActionKeys: summaryActionKeys.length > 0 ? summaryActionKeys : overviewActionKeys,
  };
}

function resolveCurrentRun(
  activeRun: ActiveRunRef | null,
  runSummaries: AgentRunSummaryView[] | null,
): AgentRunSummaryView | null {
  if (!runSummaries || runSummaries.length === 0) return null;

  if (activeRun) {
    return (
      runSummaries.find(
        (run) => run.runId === activeRun.runId || run.runId === activeRun.proposalId,
      ) ?? null
    );
  }

  const attentionWindowRuns = runSummaries.filter(
    (run) => normalizeHeadsDownCallKey(run.callKey) === "attention_window_closing",
  );
  if (attentionWindowRuns.length === 1) return attentionWindowRuns[0];

  return runSummaries[0] ?? null;
}

function resolveOverviewCallKey(
  call: AgentControlOverviewView["headsdownCall"] | null,
): string | null {
  return normalizeHeadsDownCallKey(call?.knownKey) ?? normalizeHeadsDownCallKey(call?.key);
}

function buildAttentionWindowState(
  input: {
    deadlineAt?: string | null;
    thresholdMinutes?: number | null;
    remainingMinutes?: number | null;
    hints?: string[] | null;
  } | null,
): AttentionWindowState {
  return {
    deadlineAt: normalizeIsoTimestamp(input?.deadlineAt),
    thresholdMinutes: normalizeNonNegativeFiniteNumber(input?.thresholdMinutes),
    remainingMinutes: normalizeNonNegativeFiniteNumber(input?.remainingMinutes),
    hints: Array.isArray(input?.hints)
      ? input.hints
          .map((hint) => (typeof hint === "string" ? hint.trim() : ""))
          .filter((hint): hint is string => hint.length > 0)
      : [],
  };
}

function normalizeNonNegativeFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeIsoTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}

function normalizeActionKeys(values: string[] | null | undefined): string[] {
  if (!values || values.length === 0) return [];

  return [
    ...new Set(
      values
        .map((value) => normalizeHeadsDownCallKey(value))
        .filter((value): value is string => !!value),
    ),
  ];
}
