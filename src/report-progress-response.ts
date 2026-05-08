import type { AgentControlOverviewView, AgentRunSummaryView } from "./agent-control.js";
import { resolveSessionTimeboxPrompt } from "./session-timebox.js";
import type { SessionTimeboxPromptState } from "./session-timebox.js";
import { resolveEffectiveAttentionWindow, isWithinWarningWindow } from "./time-box.js";
import type { AttentionWindowInput, EffectiveAttentionWindow, TimeBoxState } from "./time-box.js";

export interface ActiveRunRef {
  runId: string;
  proposalId: string;
}

export interface AttentionWindowState {
  deadlineAt: string | null;
  thresholdMinutes: number | null;
  remainingMinutes: number | null;
  hints: string[];
  source: "backend" | "time_box" | null;
}

export interface CurrentRunContext {
  runId: string | null;
  proposalRef: string | null;
  callKey: string | null;
  allowedActionKeys: string[];
}

interface ReportProgressGuidanceFields {
  attentionWindowClosing: boolean;
  attentionWindow: AttentionWindowState | null;
  sessionTimeboxPrompt?: SessionTimeboxPromptState;
}

interface BaseReportProgressResponse extends ReportProgressGuidanceFields {
  reported: true;
  runId: string | null;
  proposalRef: string | null;
  allowedActionKeys: string[];
}

export type ReportProgressResponse =
  | BaseReportProgressResponse
  | (ReportProgressGuidanceFields & {
      reported: false;
      reason: "unavailable";
      errorCategory: "auth" | "unexpected";
      message: string;
      details: string;
      runId?: string | null;
      proposalRef?: string | null;
      allowedActionKeys?: string[];
    });

export function buildReportProgressResponse(input: {
  activeRun: ActiveRunRef | null;
  overview: AgentControlOverviewView | null;
  wrapUpGuidance?: AttentionWindowInput | null;
  timeBox?: TimeBoxState | null;
  now?: Date;
  currentSessionId?: string | null;
}): ReportProgressResponse {
  const currentRun = resolveCurrentRunContext({
    activeRun: input.activeRun,
    overview: input.overview,
  });
  const guidance = buildReportProgressGuidance({
    callKey: currentRun.callKey,
    wrapUpGuidance: input.wrapUpGuidance ?? null,
    timeBox: input.timeBox ?? null,
    now: input.now,
    overview: input.overview,
    currentSessionId: input.currentSessionId,
  });

  return {
    reported: true,
    runId: currentRun.runId,
    proposalRef: currentRun.proposalRef,
    allowedActionKeys: currentRun.allowedActionKeys,
    ...guidance,
  };
}

export function buildReportProgressUnavailableResponse(input: {
  errorCategory: "auth" | "unexpected";
  message: string;
  details: string;
  activeRun?: ActiveRunRef | null;
  overview?: AgentControlOverviewView | null;
  wrapUpGuidance?: AttentionWindowInput | null;
  timeBox?: TimeBoxState | null;
  now?: Date;
  currentSessionId?: string | null;
}): ReportProgressResponse {
  const currentRun = resolveCurrentRunContext({
    activeRun: input.activeRun ?? null,
    overview: input.overview ?? null,
  });
  const guidance = buildReportProgressGuidance({
    callKey: currentRun.callKey,
    wrapUpGuidance: input.wrapUpGuidance ?? null,
    timeBox: input.timeBox ?? null,
    now: input.now,
    overview: input.overview ?? null,
    currentSessionId: input.currentSessionId,
  });

  return {
    reported: false,
    reason: "unavailable",
    errorCategory: input.errorCategory,
    message: input.message,
    details: input.details,
    runId: currentRun.runId,
    proposalRef: currentRun.proposalRef,
    allowedActionKeys: currentRun.allowedActionKeys,
    ...guidance,
  };
}

function buildReportProgressGuidance(input: {
  callKey: string | null;
  wrapUpGuidance: AttentionWindowInput | null;
  timeBox: TimeBoxState | null;
  now?: Date;
  overview?: AgentControlOverviewView | null;
  currentSessionId?: string | null;
}): ReportProgressGuidanceFields {
  const backendClosing =
    input.callKey === "attention_window_closing" && !isFullDepthSuppressed(input.wrapUpGuidance);
  const effectiveAttentionWindow = resolveEffectiveAttentionWindow({
    backend: input.wrapUpGuidance,
    timeBox: input.timeBox,
    now: input.now,
    forceTimeBoxWarning: backendClosing,
  });
  const attentionWindowClosing =
    !!effectiveAttentionWindow &&
    (backendClosing || isWithinWarningWindow(effectiveAttentionWindow));

  const thresholdMinutes =
    effectiveAttentionWindow?.thresholdMinutes ?? input.wrapUpGuidance?.thresholdMinutes ?? null;
  const sessionTimeboxPrompt = resolveSessionTimeboxPrompt({
    sessionSummaries: input.overview?.sessionSummaries ?? null,
    currentSessionId: input.currentSessionId,
    thresholdMinutes,
    now: input.now,
  });

  const promptFields = sessionTimeboxPrompt.active ? { sessionTimeboxPrompt } : {};

  return attentionWindowClosing
    ? {
        attentionWindowClosing: true,
        attentionWindow: buildAttentionWindowState(effectiveAttentionWindow),
        ...promptFields,
      }
    : {
        attentionWindowClosing: false,
        attentionWindow: null,
        ...promptFields,
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

function isFullDepthSuppressed(input: AttentionWindowInput | null): boolean {
  return (
    normalizeText(input?.selectedMode) === "full_depth" ||
    normalizeText(input?.source) === "forced_full_depth"
  );
}

function buildAttentionWindowState(input: EffectiveAttentionWindow | null): AttentionWindowState {
  return {
    deadlineAt: normalizeIsoTimestamp(input?.deadlineAt),
    thresholdMinutes: normalizeNonNegativeFiniteNumber(input?.thresholdMinutes),
    remainingMinutes: normalizeNonNegativeFiniteNumber(input?.remainingMinutes),
    hints: Array.isArray(input?.hints)
      ? input.hints
          .map((hint) => (typeof hint === "string" ? hint.trim() : ""))
          .filter((hint): hint is string => hint.length > 0)
      : [],
    source: input?.source ?? null,
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

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
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

function normalizeHeadsDownCallKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.replace(/[\r\n\t]+/g, " ").trim();
  if (!trimmed) return null;

  return trimmed
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[\s\-]+/g, "_")
    .toLowerCase();
}
