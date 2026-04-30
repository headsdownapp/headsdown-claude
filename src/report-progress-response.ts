import type { AgentControlOverviewView, AgentRunSummaryView } from "./agent-control.js";

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

export interface ReportProgressResponse {
  reported: boolean;
  runId: string | null;
  proposalRef: string | null;
  rabbitHoleDetected: boolean;
  attentionWindowClosing: boolean;
  attentionWindow: AttentionWindowState | null;
  allowedActionKeys: string[];
}

export function buildReportProgressResponse(input: {
  activeRun: ActiveRunRef | null;
  overview: AgentControlOverviewView | null;
  wrapUpGuidance?: {
    deadlineAt?: string | null;
    thresholdMinutes?: number | null;
    remainingMinutes?: number | null;
    hints?: string[] | null;
  } | null;
}): ReportProgressResponse {
  const currentRun = resolveCurrentRun(input.activeRun, input.overview?.runSummaries ?? null);
  const callKey = normalizeEnumValue(currentRun?.callKey);
  const rabbitHoleDetected = callKey === "rabbit_hole_detected";
  const attentionWindowClosing = callKey === "attention_window_closing";
  const allowedActionKeys = normalizeActionKeys(currentRun?.allowedActionKeys ?? []);

  return {
    reported: true,
    runId: currentRun?.runId ?? input.activeRun?.runId ?? null,
    proposalRef: input.activeRun?.proposalId ?? null,
    rabbitHoleDetected,
    attentionWindowClosing,
    attentionWindow: attentionWindowClosing
      ? buildAttentionWindowState(input.wrapUpGuidance ?? null)
      : null,
    allowedActionKeys,
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

  const actionableRuns = runSummaries.filter((run) => {
    const key = normalizeEnumValue(run.callKey);
    return key === "rabbit_hole_detected" || key === "attention_window_closing";
  });
  return actionableRuns.length === 1 ? actionableRuns[0] : null;
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
    deadlineAt:
      typeof input?.deadlineAt === "string" && input.deadlineAt.trim()
        ? input.deadlineAt.trim()
        : null,
    thresholdMinutes: typeof input?.thresholdMinutes === "number" ? input.thresholdMinutes : null,
    remainingMinutes: typeof input?.remainingMinutes === "number" ? input.remainingMinutes : null,
    hints: Array.isArray(input?.hints)
      ? input.hints
          .map((hint) => (typeof hint === "string" ? hint.trim() : ""))
          .filter((hint): hint is string => hint.length > 0)
      : [],
  };
}

function normalizeActionKeys(values: string[] | null | undefined): string[] {
  if (!values || values.length === 0) return [];

  return [
    ...new Set(
      values.map((value) => normalizeEnumValue(value)).filter((value): value is string => !!value),
    ),
  ];
}

function normalizeEnumValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase().replace(/-/g, "_");
}
