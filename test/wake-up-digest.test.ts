import { describe, expect, it } from "vitest";
import {
  detectModeTransition,
  formatWakeUpDigestInstruction,
  shouldTriggerWakeUp,
  summarizeWakeUpDigest,
  unresolvedDeferredEntries,
} from "../src/autopilot/wake-up-digest.js";

describe("wake-up digest", () => {
  it.each([
    [null, "online", "first_observation"],
    ["offline", "online", "online_arrival"],
    ["limited", "online", "online_arrival"],
    ["online", "offline", "going_offline"],
    ["offline", "offline", "still_offline"],
    ["online", "online", "still_online"],
  ] as const)("detects transition %s -> %s", (prev, curr, expected) => {
    expect(detectModeTransition(prev, curr)).toBe(expected);
  });

  it("triggers only on online arrivals and first online observation", () => {
    expect(shouldTriggerWakeUp("online_arrival", "online")).toBe(true);
    expect(shouldTriggerWakeUp("first_observation", "online")).toBe(true);
    expect(shouldTriggerWakeUp("first_observation", "offline")).toBe(false);
    expect(shouldTriggerWakeUp("still_offline", "offline")).toBe(false);
  });

  it("summarizes unresolved recorded events with derived facts only", () => {
    const entries = unresolvedDeferredEntries([
      event("recorded", "decision-1", { urgency_bucket: "high", flagged_for_review: true }),
      event("recorded", "decision-2", { urgency_bucket: "normal", flagged_for_review: false }),
      event("resolved", "decision-2", {}),
    ]);

    const summary = summarizeWakeUpDigest(entries);
    const instruction = formatWakeUpDigestInstruction(summary)!;

    expect(summary).toMatchObject({ count: 1, flaggedCount: 1, urgencyBuckets: { high: 1 } });
    expect(instruction).toContain("1 unresolved deferred decision");
    expect(instruction).toContain("headsdown_deferred");
    expect(instruction).not.toContain("/Users/alice/private.ts");
  });

  it("does not resurface decisions already tracked locally", () => {
    expect(
      unresolvedDeferredEntries([event("recorded", "decision-1", {})], ["decision-1"]),
    ).toEqual([]);
  });
});

function event(
  kind: "recorded" | "resolved",
  decisionId: string,
  payload: Record<string, unknown>,
) {
  return {
    eventType: `deferred_decision.${kind}`,
    eventId: `event-${decisionId}`,
    runId: "run-1",
    occurredAt: "2026-05-01T12:00:00.000Z",
    payload: {
      decision_id: decisionId,
      decision_kind: "human_input_required",
      urgency_bucket: "normal",
      flagged_for_review: false,
      local_session_summary: {
        outcomeCategory: "in_progress",
        toolCallCount: 2,
        fileChangeCount: 1,
        deferredDecisionCount: 1,
      },
      unsafe_local_fixture: "/Users/alice/private.ts",
      ...payload,
    },
  };
}
