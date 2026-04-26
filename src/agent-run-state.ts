import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type RunTerminalOutcome =
  | "completed"
  | "failed"
  | "partially_completed"
  | "cancelled"
  | "timed_out";

export interface AgentRunState {
  runId: string;
  proposalId: string;
  startedAt: string;
  sequence: number;
  estimatedFiles: number | null;
  sessionId: string | null;
  toolCallsCount: number;
  toolReadCount: number;
  toolWriteCount: number;
  toolExternalCount: number;
  filesModifiedCount: number | null;
  retryCount: number;
  failureCount: number;
  redirectCount: number;
  startedReported: boolean;
  terminalOutcome: RunTerminalOutcome | null;
}

interface AgentRunStateFile {
  runs: Record<string, AgentRunState>;
  activeRunsBySession: Record<string, string>;
}

const DEFAULT_STATE: AgentRunStateFile = { runs: {}, activeRunsBySession: {} };

export function agentRunStatePath(): string {
  const override = process.env.HEADSDOWN_AGENT_RUN_STATE_PATH?.trim();
  if (override) return override;
  return join(homedir(), ".config", "headsdown", "agent-run-state.json");
}

async function readStateFile(): Promise<AgentRunStateFile> {
  try {
    await access(agentRunStatePath());
  } catch {
    return { ...DEFAULT_STATE };
  }

  try {
    const raw = await readFile(agentRunStatePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AgentRunStateFile>;
    if (!parsed || typeof parsed !== "object" || !parsed.runs || typeof parsed.runs !== "object") {
      return { ...DEFAULT_STATE };
    }
    return {
      runs: parsed.runs as Record<string, AgentRunState>,
      activeRunsBySession:
        parsed.activeRunsBySession && typeof parsed.activeRunsBySession === "object"
          ? (parsed.activeRunsBySession as Record<string, string>)
          : {},
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeStateFile(state: AgentRunStateFile): Promise<void> {
  await mkdir(dirname(agentRunStatePath()), { recursive: true });
  await writeFile(agentRunStatePath(), JSON.stringify(state, null, 2), { mode: 0o600 });
}

export async function getRunState(runId: string): Promise<AgentRunState | null> {
  const state = await readStateFile();
  return state.runs[runId] ?? null;
}

export async function upsertRunState(
  runId: string,
  updater: (current: AgentRunState | null) => AgentRunState,
): Promise<AgentRunState> {
  const state = await readStateFile();
  const current = state.runs[runId] ?? null;
  const next = updater(current);
  state.runs[runId] = next;
  await writeStateFile(state);
  return next;
}

export async function getActiveRunStateForSession(
  sessionId = currentSessionId(),
): Promise<AgentRunState | null> {
  const state = await readStateFile();
  const runId = state.activeRunsBySession[sessionId];
  return runId ? (state.runs[runId] ?? null) : null;
}

export async function setActiveRunForSession(
  runId: string,
  sessionId = currentSessionId(),
): Promise<void> {
  const state = await readStateFile();
  state.activeRunsBySession[sessionId] = runId;
  await writeStateFile(state);
}

export async function clearRunState(runId: string): Promise<void> {
  const state = await readStateFile();
  if (!state.runs[runId]) return;
  delete state.runs[runId];
  for (const [sessionId, activeRunId] of Object.entries(state.activeRunsBySession)) {
    if (activeRunId === runId) delete state.activeRunsBySession[sessionId];
  }
  await writeStateFile(state);
}

export function createInitialRunState(input: {
  proposalId: string;
  estimatedFiles?: number | null;
  nowIso: string;
}): AgentRunState {
  return {
    runId: input.proposalId,
    proposalId: input.proposalId,
    startedAt: input.nowIso,
    sequence: 0,
    estimatedFiles: typeof input.estimatedFiles === "number" ? input.estimatedFiles : null,
    sessionId: currentSessionId(),
    toolCallsCount: 0,
    toolReadCount: 0,
    toolWriteCount: 0,
    toolExternalCount: 0,
    filesModifiedCount: null,
    retryCount: 0,
    failureCount: 0,
    redirectCount: 0,
    startedReported: false,
    terminalOutcome: null,
  };
}

export function nextSequence(state: AgentRunState): AgentRunState {
  return { ...state, sequence: state.sequence + 1 };
}

function currentSessionId(): string {
  return process.env.CLAUDE_SESSION_ID?.trim() || "default";
}
