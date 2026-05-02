import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HeadsDownClient } from "@headsdown/sdk";
import type { AgentRunState } from "../src/agent-run-state.js";
import { handleDetectDeferral } from "../src/autopilot/detect-deferral-handler.js";
import { normalizeAutopilotDeferralConfig } from "../src/autopilot/deferral.js";
import { AutopilotStateStore, DEFAULT_AUTOPILOT_STATE } from "../src/autopilot/state.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hd-claude-detect-deferral-"));
  process.env.HEADSDOWN_AGENT_RUN_STATE_PATH = join(tempDir, "agent-run-state.json");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env.HEADSDOWN_AGENT_RUN_STATE_PATH;
  vi.restoreAllMocks();
});

describe("handleDetectDeferral", () => {
  it("records a metadata-only deferred decision from the last assistant turn", async () => {
    const transcriptPath = await writeTranscript([
      { type: "user", message: { role: "user", content: "Please work on the task." } },
      {
        type: "assistant",
        turnIndex: 7,
        message: {
          role: "assistant",
          content: [{ type: "text", text: "[DEFER] Please confirm the deployment window." }],
        },
      },
    ]);
    const calls: Record<string, unknown>[] = [];
    const client = mockClient({ mode: "offline", calls });
    const stateStore = new AutopilotStateStore(join(tempDir, "autopilot-state.json"));
    await stateStore.save({ ...DEFAULT_AUTOPILOT_STATE, deferredDecisionCount: 2 });
    const continuationPath = join(tempDir, "continuation.json");
    await writeFile(continuationPath, JSON.stringify({ ok: true }));

    const result = await handleDetectDeferral(
      { session_id: "session-123", transcript_path: transcriptPath },
      {
        client,
        stateStore,
        continuationPath,
        now: new Date("2026-05-01T12:00:00.000Z"),
        activeRunLoader: async () =>
          activeRun({ runId: "run-123", proposalId: "proposal-123", sequence: 4 }),
      },
    );

    expect(result).toMatchObject({
      recorded: true,
      matchedPattern: "explicit_defer_marker",
      exitCode: 2,
    });
    expect(result.stderr).toContain("Defer this question");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      eventType: "deferred_decision.recorded",
      runId: "run-123",
      sequence: 7,
      privacyMode: "metadata_only",
    });
    const payload = calls[0].payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      decision_kind: "human_input_required",
      decision_category: "agent_question",
      pattern_key: "explicit_defer_marker",
      urgency_bucket: "high",
      flagged_for_review: true,
    });
    expect(payloadContainsProhibitedKey(payload)).toBe(false);
    expect(payload.local_session_summary).toMatchObject({
      generatedAt: "2026-05-01T12:00:00.000Z",
      toolCallCount: 3,
      fileChangeCount: 2,
      deferredDecisionCount: 3,
      continuationArtifactAvailable: true,
      validationLocallyPassed: false,
      outcomeCategory: "in_progress",
    });
    expect((payload.local_session_summary as Record<string, unknown>).sessionId).toMatch(
      /^h_[a-f0-9]{40}$/,
    );
    expect((payload.local_session_summary as Record<string, unknown>).approvedProposalRef).toMatch(
      /^h_[a-f0-9]{40}$/,
    );
  });

  it("records multiple distinct deferrals for the same run", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = mockClient({ mode: "offline", calls });
    const stateStore = new AutopilotStateStore(join(tempDir, "multiple-state.json"));
    const options = {
      client,
      stateStore,
      activeRunLoader: async () =>
        activeRun({ runId: "run-multiple", proposalId: "proposal-multiple" }),
    };
    const firstTranscript = await writeTranscript([
      {
        type: "assistant",
        turnIndex: 1,
        message: { role: "assistant", content: "Should I use the smaller change?" },
      },
    ]);
    const secondTranscript = await writeTranscript([
      {
        type: "assistant",
        turnIndex: 2,
        message: { role: "assistant", content: "Would you like me to validate another scenario?" },
      },
    ]);

    await expect(
      handleDetectDeferral({ session_id: "session", transcript_path: firstTranscript }, options),
    ).resolves.toMatchObject({ recorded: true });
    await expect(
      handleDetectDeferral({ session_id: "session", transcript_path: secondTranscript }, options),
    ).resolves.toMatchObject({ recorded: true });

    expect(calls.map((call) => call.eventType)).toEqual([
      "deferred_decision.recorded",
      "deferred_decision.recorded",
    ]);
    expect((await stateStore.load()).deferredDecisionCount).toBe(2);
  });

  it("persists nudge cooldown state across Stop deferrals", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = mockClient({ mode: "offline", calls });
    const stateStore = new AutopilotStateStore(join(tempDir, "cooldown-state.json"));
    const options = {
      client,
      stateStore,
      activeRunLoader: async () =>
        activeRun({ runId: "run-cooldown", proposalId: "proposal-cooldown" }),
      now: new Date("2026-05-01T12:00:00.000Z"),
    };
    const firstTranscript = await writeTranscript([
      {
        type: "assistant",
        turnIndex: 1,
        message: { role: "assistant", content: "Should I continue with A?" },
      },
    ]);
    const secondTranscript = await writeTranscript([
      {
        type: "assistant",
        turnIndex: 2,
        message: { role: "assistant", content: "Should I continue with B?" },
      },
    ]);

    const first = await handleDetectDeferral(
      { session_id: "session", transcript_path: firstTranscript },
      options,
    );
    const second = await handleDetectDeferral(
      { session_id: "session", transcript_path: secondTranscript },
      options,
    );

    expect(first).toMatchObject({ recorded: true, exitCode: 2 });
    expect(second).toMatchObject({ recorded: true });
    expect(second.exitCode).toBeUndefined();
    expect(await stateStore.load()).toMatchObject({
      deferredDecisionCount: 2,
      consecutiveNudges: 1,
      lastNudgedRunId: "run-cooldown",
      lastNudgedToolCallCount: 3,
    });
  });

  it("does not record the same run, turn, and pattern twice", async () => {
    const transcriptPath = await writeTranscript([
      {
        type: "assistant",
        turnIndex: 2,
        message: { role: "assistant", content: "Should I continue with this approach?" },
      },
    ]);
    const calls: Record<string, unknown>[] = [];
    const client = mockClient({ mode: "offline", calls });
    const stateStore = new AutopilotStateStore(join(tempDir, "autopilot-state.json"));
    const options = {
      client,
      stateStore,
      activeRunLoader: async () =>
        activeRun({ runId: "run-idempotent", proposalId: "proposal-idempotent" }),
    };

    const first = await handleDetectDeferral(
      { session_id: "session", transcript_path: transcriptPath },
      options,
    );
    const second = await handleDetectDeferral(
      { session_id: "session", transcript_path: transcriptPath },
      options,
    );

    expect(first.recorded).toBe(true);
    expect(second).toMatchObject({ recorded: false, skippedReason: "duplicate", duplicate: true });
    expect(calls).toHaveLength(1);
  });

  it("does not update local state when the hosted event write fails", async () => {
    const transcriptPath = await writeTranscript([
      {
        type: "assistant",
        turnIndex: 3,
        message: { role: "assistant", content: "Should I continue with this option?" },
      },
    ]);
    const calls: Record<string, unknown>[] = [];
    const stateStore = new AutopilotStateStore(join(tempDir, "failed-record-state.json"));

    const result = await handleDetectDeferral(
      { session_id: "session", transcript_path: transcriptPath },
      {
        client: mockClient({ mode: "offline", calls, reportOk: false }),
        stateStore,
        activeRunLoader: async () =>
          activeRun({ runId: "run-failed-record", proposalId: "proposal-failed-record" }),
      },
    );

    expect(result).toMatchObject({ recorded: false, skippedReason: "record_failed" });
    expect(calls).toHaveLength(1);
    expect(await stateStore.load()).toMatchObject({
      deferredDecisionCount: 0,
      lastSeenDeferralKey: null,
    });
  });

  it("skips benign assistant turns without reporting", async () => {
    const transcriptPath = await writeTranscript([
      {
        type: "assistant",
        turnIndex: 1,
        message: { role: "assistant", content: "I finished the local build." },
      },
    ]);
    const calls: Record<string, unknown>[] = [];

    const result = await handleDetectDeferral(
      { session_id: "session", transcript_path: transcriptPath },
      {
        client: mockClient({ mode: "offline", calls }),
        stateStore: new AutopilotStateStore(join(tempDir, "benign-state.json")),
      },
    );

    expect(result).toMatchObject({ recorded: false, skippedReason: "no_match" });
    expect(calls).toHaveLength(0);
  });

  it("skips gracefully when the client or mode is unavailable", async () => {
    const transcriptPath = await writeTranscript([
      {
        type: "assistant",
        turnIndex: 1,
        message: { role: "assistant", content: "Should I continue?" },
      },
    ]);

    await expect(
      handleDetectDeferral(
        { session_id: "session", transcript_path: transcriptPath },
        {
          clientFactory: async () => {
            throw new Error("no credentials");
          },
          stateStore: new AutopilotStateStore(join(tempDir, "client-unavailable-state.json")),
        },
      ),
    ).resolves.toMatchObject({ recorded: false, skippedReason: "client_unavailable" });

    await expect(
      handleDetectDeferral(
        { session_id: "session", transcript_path: transcriptPath },
        {
          client: mockClient({ mode: "offline", calls: [], throwAvailability: true }),
          stateStore: new AutopilotStateStore(join(tempDir, "mode-unavailable-state.json")),
        },
      ),
    ).resolves.toMatchObject({ recorded: false, skippedReason: "mode_unavailable" });
  });

  it("does not include raw assistant text in hosted payloads for suspicious deferral messages", async () => {
    const suspiciousSamples = [
      "[DEFER] Should I edit /Users/alice/private/repo/src/secret.ts before continuing?",
      "[DEFER] Should I use src/private/path.ts or another file?",
      "[DEFER] Should I open https://example.com/internal-ticket before continuing?",
      "[DEFER] Should I apply this diff? ```diff\n- password=secret\n+ password=token\n```",
      "[DEFER] Should I run `git status` after stdout showed a stacktrace?",
    ];

    for (const [index, message] of suspiciousSamples.entries()) {
      const transcriptPath = await writeTranscript([
        { type: "assistant", turnIndex: index, message: { role: "assistant", content: message } },
      ]);
      const calls: Record<string, unknown>[] = [];
      const stateStore = new AutopilotStateStore(join(tempDir, `autopilot-state-${index}.json`));

      const result = await handleDetectDeferral(
        { session_id: `session-${index}`, transcript_path: transcriptPath },
        {
          client: mockClient({ mode: "offline", calls }),
          stateStore,
          activeRunLoader: async () =>
            activeRun({ runId: `run-${index}`, proposalId: `proposal-${index}` }),
        },
      );

      expect(result.recorded).toBe(true);
      expect(calls).toHaveLength(1);
      const payload = calls[0].payload as Record<string, unknown>;
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain(message);
      for (const forbiddenFragment of [
        "/Users/alice",
        "src/private/path.ts",
        "https://example.com",
        "password=secret",
        "git status",
        "stdout",
        "stacktrace",
      ]) {
        expect(serialized).not.toContain(forbiddenFragment);
      }
      expect(payloadContainsProhibitedKey(payload)).toBe(false);
      expect((payload.local_session_summary as Record<string, unknown>).sessionId).toMatch(
        /^h_[a-f0-9]{40}$/,
      );
      expect(
        (payload.local_session_summary as Record<string, unknown>).approvedProposalRef,
      ).toMatch(/^h_[a-f0-9]{40}$/);
    }
  });

  it("honors a custom config loader", async () => {
    const transcriptPath = await writeTranscript([
      { type: "assistant", turnIndex: 1, message: { role: "assistant", content: "CUSTOM_GATE" } },
    ]);
    const calls: Record<string, unknown>[] = [];

    const result = await handleDetectDeferral(
      { session_id: "session", transcript_path: transcriptPath },
      {
        client: mockClient({ mode: "limited", calls }),
        stateStore: new AutopilotStateStore(join(tempDir, "custom-config-state.json")),
        configLoader: async () =>
          normalizeAutopilotDeferralConfig({
            includeLimitedMode: true,
            patterns: [{ key: "custom", pattern: "CUSTOM_GATE" }],
          }),
      },
    );

    expect(result).toMatchObject({ recorded: true, matchedPattern: "custom" });
    expect(calls).toHaveLength(1);
  });
});

async function writeTranscript(lines: Record<string, unknown>[]): Promise<string> {
  const path = join(tempDir, `transcript-${Math.random().toString(16).slice(2)}.jsonl`);
  await writeFile(path, lines.map((line) => JSON.stringify(line)).join("\n"));
  return path;
}

function mockClient(input: {
  mode: string;
  calls: Record<string, unknown>[];
  throwAvailability?: boolean;
  reportOk?: boolean;
}): HeadsDownClient {
  return {
    getAvailability: vi.fn(async () => {
      if (input.throwAvailability) throw new Error("unavailable");
      return { contract: { mode: input.mode }, schedule: {} };
    }),
    reportAgentRunEvent: vi.fn(async (event: Record<string, unknown>) => {
      input.calls.push(event);
      return input.reportOk === false
        ? { ok: false, event: null, error: { code: "REJECTED", message: "rejected", details: {} } }
        : { ok: true, event: null, error: null };
    }),
  } as unknown as HeadsDownClient;
}

function activeRun(input: { runId: string; proposalId: string; sequence?: number }): AgentRunState {
  return {
    runId: input.runId,
    proposalId: input.proposalId,
    startedAt: "2026-05-01T12:00:00.000Z",
    sequence: input.sequence ?? 0,
    estimatedFiles: null,
    sessionId: "session",
    toolCallsCount: 3,
    toolReadCount: 1,
    toolWriteCount: 2,
    toolExternalCount: 0,
    filesModifiedCount: 2,
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
