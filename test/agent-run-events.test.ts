import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { HeadsDownClient } from "@headsdown/sdk";
import {
  reportRunOutcome,
  reportRunProgress,
  reportRunResumed,
  reportRunStarted,
} from "../src/agent-run-events.js";
import { reportAgentRunEventCompat } from "../src/agent-run-reporter.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hd-claude-run-events-"));
  process.env.HEADSDOWN_AGENT_RUN_STATE_PATH = join(tempDir, "agent-run-state.json");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env.HEADSDOWN_AGENT_RUN_STATE_PATH;
  delete process.env.CLAUDE_SESSION_ID;
  vi.restoreAllMocks();
});

function containsProhibitedKey(value: unknown): boolean {
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
    if (containsProhibitedKey(child)) return true;
  }

  return false;
}

describe("agent run event reporting", () => {
  it("reports started, progress, and terminal events with privacy-safe payloads", async () => {
    const calls: Record<string, unknown>[] = [];
    const mockClient = {
      reportAgentRunEvent: vi.fn(async (input: Record<string, unknown>) => {
        calls.push(input);
      }),
    } as unknown as HeadsDownClient;

    await reportRunStarted(mockClient, {
      proposalId: "proposal-123",
      estimatedFiles: 2,
      estimatedMinutes: 20,
    });
    await reportRunProgress(mockClient, {
      proposalId: "proposal-123",
      toolType: "write",
      filesModifiedCount: 1,
    });
    await reportRunProgress(mockClient, {
      proposalId: "proposal-123",
      toolType: "write",
      filesModifiedCount: 2,
    });
    await reportRunOutcome(mockClient, { proposalId: "proposal-123", outcome: "completed" });

    expect(calls.map((call) => call.eventType)).toEqual([
      "agent_run.started",
      "agent_run.progress_reported",
      "agent_run.progress_reported",
      "agent_run.completed",
    ]);

    expect(calls.map((call) => call.sequence)).toEqual([1, 2, 3, 4]);
    expect(calls.map((call) => call.idempotencyKey)).toEqual([
      "proposal-123:agent_run.started:1",
      "proposal-123:agent_run.progress_reported:2",
      "proposal-123:agent_run.progress_reported:3",
      "proposal-123:agent_run.completed:4",
    ]);

    for (const call of calls) {
      expect(call.workspaceRef).toBe("unknown");
      expect(call.source).toBe("claude_code");
      expect(call.proposalRef).toBe("proposal-123");
      expect(containsProhibitedKey(call)).toBe(false);
    }

    const progressEvent = calls[1];
    expect(progressEvent.payload).toBeUndefined();
    expect(progressEvent.progressPayload).toMatchObject({
      toolCallsCount: 1,
      toolWriteCount: 1,
      filesModifiedBucket: "1_to_2",
      scopeGrowthBucket: "1_to_2_files",
      validationStatus: "unknown",
      scopeChanged: false,
    });

    const completedEvent = calls[3];
    expect((completedEvent.payload as Record<string, unknown>).outcome).toBe("succeeded");
  });

  it("maps failed and cancelled outcomes to taxonomy values", async () => {
    const calls: Record<string, unknown>[] = [];
    const mockClient = {
      reportAgentRunEvent: vi.fn(async (input: Record<string, unknown>) => {
        calls.push(input);
      }),
    } as unknown as HeadsDownClient;

    await reportRunStarted(mockClient, { proposalId: "proposal-failed" });
    await reportRunOutcome(mockClient, { proposalId: "proposal-failed", outcome: "failed" });

    expect(calls[1].eventType).toBe("agent_run.failed");
    expect((calls[1].payload as Record<string, unknown>).failure_category).toBe("unknown");

    calls.length = 0;
    await reportRunStarted(mockClient, { proposalId: "proposal-cancelled" });
    await reportRunOutcome(mockClient, { proposalId: "proposal-cancelled", outcome: "cancelled" });

    expect(calls[1].eventType).toBe("agent_run.cancelled");
    expect((calls[1].payload as Record<string, unknown>).cancelled_by).toBe("agent");
  });

  it("does not duplicate started or terminal lifecycle events", async () => {
    const calls: Record<string, unknown>[] = [];
    const mockClient = {
      reportAgentRunEvent: vi.fn(async (input: Record<string, unknown>) => {
        calls.push(input);
      }),
    } as unknown as HeadsDownClient;

    await reportRunStarted(mockClient, { proposalId: "proposal-idempotent" });
    await reportRunStarted(mockClient, { proposalId: "proposal-idempotent" });
    await reportRunOutcome(mockClient, { proposalId: "proposal-idempotent", outcome: "completed" });
    await reportRunOutcome(mockClient, { proposalId: "proposal-idempotent", outcome: "completed" });

    expect(calls.map((call) => call.eventType)).toEqual([
      "agent_run.started",
      "agent_run.completed",
    ]);
  });

  it("maps paused and timed-out outcomes to taxonomy values", async () => {
    const calls: Record<string, unknown>[] = [];
    const mockClient = {
      reportAgentRunEvent: vi.fn(async (input: Record<string, unknown>) => {
        calls.push(input);
      }),
    } as unknown as HeadsDownClient;

    await reportRunStarted(mockClient, { proposalId: "proposal-paused" });
    await reportRunOutcome(mockClient, {
      proposalId: "proposal-paused",
      outcome: "partially_completed",
    });

    expect(calls[1].eventType).toBe("agent_run.completed");
    expect((calls[1].payload as Record<string, unknown>).outcome).toBe("paused");

    calls.length = 0;
    await reportRunStarted(mockClient, { proposalId: "proposal-timeout" });
    await reportRunOutcome(mockClient, { proposalId: "proposal-timeout", outcome: "timed_out" });

    expect(calls[1].eventType).toBe("agent_run.failed");
    expect((calls[1].payload as Record<string, unknown>).failure_category).toBe("timeout");
  });

  it("reports scope drift when available write counts exceed the proposal estimate", async () => {
    const calls: Record<string, unknown>[] = [];
    const mockClient = {
      reportAgentRunEvent: vi.fn(async (input: Record<string, unknown>) => {
        calls.push(input);
      }),
    } as unknown as HeadsDownClient;

    await reportRunStarted(mockClient, { proposalId: "proposal-scope", estimatedFiles: 1 });
    await reportRunProgress(mockClient, {
      proposalId: "proposal-scope",
      toolType: "write",
      filesModifiedCount: 2,
    });

    expect(calls[1].progressPayload).toMatchObject({
      filesModifiedBucket: "1_to_2",
      scopeGrowthBucket: "1_to_2_files",
      scopeChanged: true,
    });
  });

  it("reports progress against the active session run", async () => {
    const calls: Record<string, unknown>[] = [];
    const mockClient = {
      reportAgentRunEvent: vi.fn(async (input: Record<string, unknown>) => {
        calls.push(input);
      }),
    } as unknown as HeadsDownClient;

    process.env.CLAUDE_SESSION_ID = "session-a";
    await reportRunStarted(mockClient, { proposalId: "proposal-a" });
    process.env.CLAUDE_SESSION_ID = "session-b";
    await reportRunStarted(mockClient, { proposalId: "proposal-b" });
    process.env.CLAUDE_SESSION_ID = "session-a";
    await reportRunProgress(mockClient, { toolType: "read" });

    expect(calls.at(-1)).toMatchObject({
      eventType: "agent_run.progress_reported",
      runId: "proposal-a",
      proposalRef: "proposal-a",
    });
    expect(calls.at(-1)?.progressPayload).toMatchObject({
      toolCallsCount: 1,
      toolReadCount: 1,
      toolWriteCount: 0,
      filesModifiedBucket: "unknown",
    });

    delete process.env.CLAUDE_SESSION_ID;
  });

  it("reports resume events", async () => {
    const calls: Record<string, unknown>[] = [];
    const mockClient = {
      reportAgentRunEvent: vi.fn(async (input: Record<string, unknown>) => {
        calls.push(input);
      }),
    } as unknown as HeadsDownClient;

    await reportRunResumed(mockClient, { runId: "proposal-resume" });
    expect(calls[0].eventType).toBe("agent_run.resumed");
    expect((calls[0].payload as Record<string, unknown>).action_key).toBe("resume_run");
  });

  it("fails open when the SDK and GraphQL reporting paths are unavailable", async () => {
    const mockClient = {} as HeadsDownClient;
    await expect(
      reportRunProgress(mockClient, { proposalId: "proposal-noop" }),
    ).resolves.toBeUndefined();
  });

  it("reporter fallback returns false on GraphQL failures", async () => {
    const mockClient = {
      graphql: {
        request: vi.fn().mockRejectedValue(new Error("boom")),
      },
    } as unknown as HeadsDownClient;

    const ok = await reportAgentRunEventCompat(mockClient, {
      runId: "proposal-graphql",
      eventType: "agent_run.progress_reported",
      sequence: 1,
      idempotencyKey: "proposal-graphql:agent_run.progress_reported:1",
      progressPayload: {
        elapsedSeconds: 10,
        toolCallsCount: 1,
        toolReadCount: 0,
        toolWriteCount: 1,
        toolExternalCount: 0,
        filesReadBucket: "unknown",
        filesModifiedBucket: "1_to_2",
        validationLevel: "unknown",
        validationStatus: "unknown",
        retryCount: 0,
        failureCount: 0,
        scopeChanged: false,
        redirectCount: 0,
        progressState: "working",
      },
    });

    expect(ok).toBe(false);
  });
});
