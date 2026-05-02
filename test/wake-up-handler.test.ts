import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HeadsDownClient } from "@headsdown/sdk";
import { handleWakeUp } from "../src/autopilot/wake-up-handler.js";
import { AutopilotStateStore, DEFAULT_AUTOPILOT_STATE } from "../src/autopilot/state.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hd-claude-wake-up-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("handleWakeUp", () => {
  it("emits additionalContext on offline to online transition and tracks surfaced ids", async () => {
    const stateStore = new AutopilotStateStore(join(tempDir, "autopilot-state.json"));
    await stateStore.save({ ...DEFAULT_AUTOPILOT_STATE, lastObservedMode: "offline" });

    const result = await handleWakeUp({
      client: mockClient({ mode: "online", events: [recordedEvent("decision-1")] }),
      stateStore,
      now: new Date("2026-05-01T12:00:00.000Z"),
    });

    expect(result.emitted).toBe(true);
    expect(result.output).toMatchObject({ hookSpecificOutput: { hookEventName: "SessionStart" } });
    expect(JSON.stringify(result.output)).toContain("headsdown_deferred");
    expect(JSON.stringify(result.output)).not.toContain("/Users/alice/private.ts");
    expect(await stateStore.load()).toMatchObject({
      lastObservedMode: "online",
      surfacedDecisionIds: ["decision-1"],
    });
  });

  it("does not resurface the same decision twice", async () => {
    const stateStore = new AutopilotStateStore(join(tempDir, "autopilot-state.json"));
    await stateStore.save({ ...DEFAULT_AUTOPILOT_STATE, lastObservedMode: "offline" });
    const client = mockClient({ mode: "online", events: [recordedEvent("decision-1")] });

    expect((await handleWakeUp({ client, stateStore })).emitted).toBe(true);
    await stateStore.update((state) => ({
      ...state,
      lastObservedMode: "offline",
      modeCachedAt: null,
      modeCacheValue: null,
    }));
    expect(await handleWakeUp({ client, stateStore })).toMatchObject({
      emitted: false,
      skippedReason: "empty",
    });
  });

  it("fails open when event listing fails", async () => {
    const stateStore = new AutopilotStateStore(join(tempDir, "autopilot-state.json"));
    await stateStore.save({ ...DEFAULT_AUTOPILOT_STATE, lastObservedMode: "offline" });

    await expect(
      handleWakeUp({
        client: mockClient({ mode: "online", events: [], throwList: true }),
        stateStore,
      }),
    ).resolves.toMatchObject({ emitted: false, skippedReason: "events_unavailable" });
    expect((await stateStore.load()).lastObservedMode).toBe("offline");
  });
});

function mockClient(input: {
  mode: string;
  events: Record<string, unknown>[];
  throwList?: boolean;
}): HeadsDownClient {
  return {
    getAvailability: vi.fn(async () => ({ contract: { mode: input.mode }, schedule: {} })),
    listAgentRunEvents: vi.fn(async () => {
      if (input.throwList) throw new Error("unavailable");
      return input.events;
    }),
  } as unknown as HeadsDownClient;
}

function recordedEvent(decisionId: string) {
  return {
    eventType: "deferred_decision.recorded",
    eventId: `event-${decisionId}`,
    runId: "run-1",
    occurredAt: "2026-05-01T12:00:00.000Z",
    payload: {
      decision_id: decisionId,
      decision_kind: "human_input_required",
      urgency_bucket: "high",
      flagged_for_review: true,
      local_session_summary: {
        outcomeCategory: "in_progress",
        toolCallCount: 2,
        fileChangeCount: 1,
        deferredDecisionCount: 1,
      },
      raw_fixture: "/Users/alice/private.ts",
    },
  };
}
