import type { HeadsDownClient } from "@headsdown/sdk";
import {
  clearRunState,
  createInitialRunState,
  getActiveRunStateForSession,
  getRunState,
  nextSequence,
  setActiveRunForSession,
  upsertRunState,
  type RunTerminalOutcome,
} from "./agent-run-state.js";
import { buildTerminalEvent, progressPayload, startedPayload } from "./agent-run-progress.js";
import { reportAgentRunEventCompat } from "./agent-run-reporter.js";

function eventKey(runId: string, eventType: string, sequence: number): string {
  return `${runId}:${eventType}:${sequence}`;
}

export async function reportRunStarted(
  client: HeadsDownClient,
  input: { proposalId: string; estimatedFiles?: number; estimatedMinutes?: number },
): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const state = await upsertRunState(input.proposalId, (current) => {
      if (current?.startedReported) return current;
      return createInitialRunState({
        proposalId: input.proposalId,
        estimatedFiles: input.estimatedFiles,
        nowIso,
      });
    });

    if (state.startedReported) {
      return;
    }

    await setActiveRunForSession(input.proposalId);

    const withSequence = nextSequence(state);
    const ok = await reportAgentRunEventCompat(client, {
      runId: withSequence.runId,
      eventType: "agent_run.started",
      sequence: withSequence.sequence,
      idempotencyKey: eventKey(withSequence.runId, "agent_run.started", withSequence.sequence),
      payload: startedPayload({
        estimatedFiles: input.estimatedFiles,
        estimatedMinutes: input.estimatedMinutes,
      }),
      correlationId: input.proposalId,
      proposalRef: input.proposalId,
    });

    if (!ok) return;

    await upsertRunState(input.proposalId, (current) => {
      const base = current ?? withSequence;
      return {
        ...base,
        sequence: withSequence.sequence,
        startedReported: true,
        estimatedFiles:
          typeof input.estimatedFiles === "number" ? input.estimatedFiles : base.estimatedFiles,
      };
    });
  } catch {
    // Reporting must never block the primary Claude workflow.
  }
}

export async function reportRunProgress(
  client: HeadsDownClient,
  input: {
    proposalId?: string;
    toolType?: "read" | "write" | "external";
    filesModifiedCount?: number;
  },
): Promise<void> {
  try {
    const activeRun = input.proposalId
      ? await getRunState(input.proposalId)
      : await getActiveRunStateForSession();
    if (!activeRun) return;

    const state = await upsertRunState(activeRun.runId, (current) => {
      const base = current ?? activeRun;

      return {
        ...base,
        toolCallsCount: base.toolCallsCount + 1,
        toolReadCount: base.toolReadCount + (input.toolType === "read" ? 1 : 0),
        toolWriteCount: base.toolWriteCount + (input.toolType === "write" ? 1 : 0),
        toolExternalCount: base.toolExternalCount + (input.toolType === "external" ? 1 : 0),
        filesModifiedCount:
          typeof input.filesModifiedCount === "number"
            ? Math.max(input.filesModifiedCount, base.filesModifiedCount ?? 0)
            : base.filesModifiedCount,
      };
    });

    const withSequence = nextSequence(state);
    const ok = await reportAgentRunEventCompat(client, {
      runId: withSequence.runId,
      eventType: "agent_run.progress_reported",
      sequence: withSequence.sequence,
      idempotencyKey: eventKey(
        withSequence.runId,
        "agent_run.progress_reported",
        withSequence.sequence,
      ),
      progressPayload: progressPayload(withSequence),
      correlationId: state.proposalId,
      proposalRef: state.proposalId,
    });

    if (!ok) return;

    await upsertRunState(state.runId, (current) => ({
      ...(current ?? withSequence),
      sequence: withSequence.sequence,
    }));
  } catch {
    // Reporting must never block the primary Claude workflow.
  }
}

export async function reportRunOutcome(
  client: HeadsDownClient,
  input: {
    proposalId: string;
    outcome: RunTerminalOutcome;
    errorCategory?: string;
    testsPassed?: boolean;
  },
): Promise<void> {
  try {
    const state = await getRunState(input.proposalId);
    if (!state || state.terminalOutcome) {
      return;
    }

    const terminalState = nextSequence(state);
    const terminalEvent = buildTerminalEvent(terminalState, input.outcome, {
      errorCategory: input.errorCategory,
      testsPassed: input.testsPassed,
    });

    const terminalOk = await reportAgentRunEventCompat(client, {
      runId: terminalState.runId,
      eventType: terminalEvent.eventType,
      sequence: terminalState.sequence,
      idempotencyKey: eventKey(
        terminalState.runId,
        terminalEvent.eventType,
        terminalState.sequence,
      ),
      payload: terminalEvent.payload,
      correlationId: input.proposalId,
      proposalRef: input.proposalId,
    });

    if (!terminalOk) return;

    await upsertRunState(input.proposalId, (current) => ({
      ...(current ?? terminalState),
      sequence: terminalState.sequence,
      terminalOutcome: input.outcome,
    }));

    await clearRunState(input.proposalId);
  } catch {
    // Reporting must never block the primary Claude workflow.
  }
}

export async function reportRunResumed(
  client: HeadsDownClient,
  input: { runId: string },
): Promise<void> {
  try {
    const state = await upsertRunState(input.runId, (current) => {
      if (current) return current;
      return createInitialRunState({ proposalId: input.runId, nowIso: new Date().toISOString() });
    });
    await setActiveRunForSession(input.runId);

    const withSequence = nextSequence(state);

    const ok = await reportAgentRunEventCompat(client, {
      runId: withSequence.runId,
      eventType: "agent_run.resumed",
      sequence: withSequence.sequence,
      idempotencyKey: eventKey(withSequence.runId, "agent_run.resumed", withSequence.sequence),
      payload: {
        continuation_id: `cont_${withSequence.runId}`,
        resumed_by: "agent",
        resume_source: "manual",
        validation_status: "unknown",
        call_key: "ready_to_resume",
        action_key: "resume_run",
      },
      correlationId: input.runId,
      proposalRef: input.runId,
    });

    if (!ok) return;

    await upsertRunState(input.runId, (current) => ({
      ...(current ?? withSequence),
      sequence: withSequence.sequence,
    }));
  } catch {
    // Reporting must never block the primary Claude workflow.
  }
}
