import { describe, expect, it, vi } from "vitest";
import type { HeadsDownClient } from "@headsdown/sdk";
import { handleDeferredTool } from "../src/headsdown-deferred-tool.js";

describe("headsdown_deferred tool", () => {
  it("lists derived facts only", async () => {
    const output = await handleDeferredTool(mockClient([recordedEvent("decision-1")]), {
      action: "list",
    });

    expect(output.summary).toMatchObject({ count: 1, flaggedCount: 1 });
    expect(JSON.stringify(output)).not.toContain("/Users/alice/private.ts");
  });

  it("views one deferred decision by id without raw fixture text", async () => {
    const output = await handleDeferredTool(mockClient([recordedEvent("decision-1")]), {
      action: "view",
      decision_id: "decision-1",
    });

    expect(output.entry).toMatchObject({ decisionId: "decision-1", urgencyBucket: "high" });
    expect(JSON.stringify(output)).not.toContain("/Users/alice/private.ts");
  });

  it.each([
    ["approve", "approved", undefined],
    ["override", "overridden", "wrong_framing"],
    ["refine", "refined", "needs_more_info"],
    ["dismiss", "dismissed", "other"],
  ] as const)("maps %s to %s", async (action, resolutionKind, notesBucket) => {
    const resolutions: Record<string, unknown>[] = [];

    await handleDeferredTool(mockClient([recordedEvent("decision-1")], resolutions), {
      action,
      decision_id: "decision-1",
    });

    expect(resolutions[0].payload).toMatchObject({
      decision_id: "decision-1",
      resolution_kind: resolutionKind,
    });
    expect(resolutions[0].payload).toHaveProperty("notes_bucket", notesBucket);
  });

  it("writes a resolved event", async () => {
    const resolutions: Record<string, unknown>[] = [];
    const output = await handleDeferredTool(
      mockClient([recordedEvent("decision-1")], resolutions),
      {
        action: "approve",
        decision_id: "decision-1",
      },
    );

    expect(output).toMatchObject({
      resolved: true,
      decisionId: "decision-1",
      resolutionKind: "approved",
    });
    expect(resolutions[0].payload).toMatchObject({
      decision_id: "decision-1",
      resolution_kind: "approved",
    });
  });

  it("rejects already resolved decisions and API failures", async () => {
    await expect(
      handleDeferredTool(mockClient([recordedEvent("decision-1"), resolvedEvent("decision-1")]), {
        action: "approve",
        decision_id: "decision-1",
      }),
    ).rejects.toThrow(/already resolved/);

    await expect(
      handleDeferredTool(mockClient([recordedEvent("decision-2")], [], false), {
        action: "approve",
        decision_id: "decision-2",
      }),
    ).rejects.toThrow(/Could not resolve/);
  });
});

function mockClient(
  events: Record<string, unknown>[],
  resolutions: Record<string, unknown>[] = [],
  reportOk = true,
): HeadsDownClient {
  return {
    listAgentRunEvents: vi.fn(async () => events),
    reportDeferredDecisionResolved: vi.fn(
      async (context: Record<string, unknown>, payload: Record<string, unknown>) => {
        resolutions.push({ context, payload });
        return reportOk
          ? { ok: true, event: null, error: null }
          : {
              ok: false,
              event: null,
              error: { code: "REJECTED", message: "rejected", details: {} },
            };
      },
    ),
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

function resolvedEvent(decisionId: string) {
  return {
    eventType: "deferred_decision.resolved",
    eventId: `resolved-${decisionId}`,
    runId: "run-1",
    occurredAt: "2026-05-01T12:01:00.000Z",
    payload: {
      decision_id: decisionId,
      resolution_kind: "approved",
    },
  };
}
