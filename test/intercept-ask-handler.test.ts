import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HeadsDownClient } from "@headsdown/sdk";
import type { AgentRunState } from "../src/agent-run-state.js";
import { handleInterceptAsk } from "../src/autopilot/intercept-ask-handler.js";
import { AutopilotStateStore } from "../src/autopilot/state.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hd-claude-intercept-ask-"));
  process.env.HEADSDOWN_AGENT_RUN_STATE_PATH = join(tempDir, "agent-run-state.json");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env.HEADSDOWN_AGENT_RUN_STATE_PATH;
  vi.restoreAllMocks();
});

describe("handleInterceptAsk", () => {
  it("denies AskUserQuestion in autopilot mode and records a privacy-safe deferral", async () => {
    const calls: Record<string, unknown>[] = [];
    const result = await handleInterceptAsk(
      {
        tool_name: "AskUserQuestion",
        tool_input: { questions: ["Should I edit /Users/alice/private.ts?"] },
        session_id: "session-ask",
      },
      {
        client: mockClient({ mode: "offline", calls }),
        stateStore: new AutopilotStateStore(join(tempDir, "autopilot-state.json")),
        activeRunLoader: async () => activeRun({ runId: "run-ask", proposalId: "proposal-ask" }),
        now: new Date("2026-05-01T12:00:00.000Z"),
      },
    );

    expect(result.denied).toBe(true);
    expect(result.output).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
      },
    });
    expect(JSON.stringify(result.output)).toContain("Do not call AskUserQuestion");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      eventType: "deferred_decision.recorded",
      runId: "run-ask",
      privacyMode: "metadata_only",
    });
    const payload = calls[0].payload as Record<string, unknown>;
    expect(payload.pattern_key).toBe("ask_user_question");
    expect(JSON.stringify(payload)).not.toContain("/Users/alice/private.ts");
    expect(payloadContainsProhibitedKey(payload)).toBe(false);
  });

  it("fails open when recording the deferred decision fails", async () => {
    const calls: Record<string, unknown>[] = [];

    const result = await handleInterceptAsk(
      {
        tool_name: "AskUserQuestion",
        tool_input: { questions: ["Can I ask?"] },
        session_id: "session",
      },
      {
        client: mockClient({ mode: "offline", calls, reportOk: false }),
        stateStore: new AutopilotStateStore(join(tempDir, "record-failed-state.json")),
      },
    );

    expect(result).toMatchObject({
      denied: false,
      recorded: false,
      skippedReason: "record_failed",
    });
    expect(calls).toHaveLength(1);
  });

  it("allows AskUserQuestion outside autopilot mode", async () => {
    const calls: Record<string, unknown>[] = [];

    const result = await handleInterceptAsk(
      {
        tool_name: "AskUserQuestion",
        tool_input: { questions: ["Can I ask?"] },
        session_id: "session",
      },
      {
        client: mockClient({ mode: "online", calls }),
        stateStore: new AutopilotStateStore(join(tempDir, "online-state.json")),
      },
    );

    expect(result).toMatchObject({
      denied: false,
      recorded: false,
      skippedReason: "not_autopilot",
    });
    expect(calls).toHaveLength(0);
  });

  it("records distinct AskUserQuestion calls with the same question count", async () => {
    const calls: Record<string, unknown>[] = [];
    const stateStore = new AutopilotStateStore(join(tempDir, "distinct-state.json"));
    const options = {
      client: mockClient({ mode: "offline", calls }),
      stateStore,
      activeRunLoader: async () =>
        activeRun({ runId: "run-distinct", proposalId: "proposal-distinct" }),
    };

    await handleInterceptAsk(
      {
        tool_name: "AskUserQuestion",
        tool_input: { questions: ["First local-only question"] },
        session_id: "session",
      },
      options,
    );
    await handleInterceptAsk(
      {
        tool_name: "AskUserQuestion",
        tool_input: { questions: ["Second local-only question"] },
        session_id: "session",
      },
      options,
    );

    expect(calls).toHaveLength(2);
    expect((await stateStore.load()).deferredDecisionCount).toBe(2);
  });

  it("deduplicates repeated AskUserQuestion intercepts", async () => {
    const calls: Record<string, unknown>[] = [];
    const stateStore = new AutopilotStateStore(join(tempDir, "dedupe-state.json"));
    const options = {
      client: mockClient({ mode: "offline", calls }),
      stateStore,
      activeRunLoader: async () =>
        activeRun({ runId: "run-dedupe", proposalId: "proposal-dedupe" }),
    };
    const input = {
      tool_name: "AskUserQuestion",
      tool_input: { questions: ["Question text must stay local"] },
      session_id: "session",
    };

    await handleInterceptAsk(input, options);
    await handleInterceptAsk(input, options);

    expect(calls).toHaveLength(1);
    expect((await stateStore.load()).deferredDecisionCount).toBe(1);
  });
});

function mockClient(input: {
  mode: string;
  calls: Record<string, unknown>[];
  reportOk?: boolean;
}): HeadsDownClient {
  return {
    getAvailability: vi.fn(async () => ({ contract: { mode: input.mode }, schedule: {} })),
    reportAgentRunEvent: vi.fn(async (event: Record<string, unknown>) => {
      input.calls.push(event);
      return input.reportOk === false
        ? { ok: false, event: null, error: { code: "REJECTED", message: "rejected", details: {} } }
        : { ok: true, event: null, error: null };
    }),
  } as unknown as HeadsDownClient;
}

function activeRun(input: { runId: string; proposalId: string }): AgentRunState {
  return {
    runId: input.runId,
    proposalId: input.proposalId,
    startedAt: "2026-05-01T12:00:00.000Z",
    sequence: 0,
    estimatedFiles: null,
    sessionId: "session",
    toolCallsCount: 1,
    toolReadCount: 1,
    toolWriteCount: 0,
    toolExternalCount: 0,
    filesModifiedCount: 0,
    retryCount: 0,
    failureCount: 0,
    redirectCount: 0,
    startedReported: true,
    terminalOutcome: null,
  };
}

function payloadContainsProhibitedKey(value: unknown): boolean {
  const prohibited = new Set([
    "prompt",
    "prompts",
    "message",
    "messages",
    "content",
    "code",
    "diff",
    "patch",
    "file_path",
    "file_paths",
    "path",
    "paths",
    "repo",
    "repository",
    "branch",
    "stdout",
    "stderr",
    "log",
    "logs",
    "stacktrace",
    "traceback",
    "command",
    "cwd",
  ]);

  if (!value || typeof value !== "object") return false;

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>);

  for (const [key, child] of entries) {
    if (prohibited.has(key.toLowerCase())) return true;
    if (payloadContainsProhibitedKey(child)) return true;
  }

  return false;
}
