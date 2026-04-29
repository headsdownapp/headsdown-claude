import type { AgentControlOverviewView, AgentRunSummaryView } from "./agent-control.js";

export interface ActiveRunRef {
  runId: string;
  proposalId: string;
}

export interface ReportProgressResponse {
  reported: boolean;
  runId: string | null;
  proposalRef: string | null;
  allowedActionKeys: string[];
}

export function buildReportProgressResponse(input: {
  activeRun: ActiveRunRef | null;
  overview: AgentControlOverviewView | null;
}): ReportProgressResponse {
  const currentRun = resolveCurrentRun(input.activeRun, input.overview?.runSummaries ?? null);
  const allowedActionKeys = normalizeActionKeys(currentRun?.allowedActionKeys ?? []);

  return {
    reported: true,
    runId: currentRun?.runId ?? input.activeRun?.runId ?? null,
    proposalRef: input.activeRun?.proposalId ?? null,
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

  return runSummaries[0] ?? null;
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
