import { describe, expect, it } from "vitest";
import { buildReportProgressResponse } from "../src/report-progress-response.js";

describe("buildReportProgressResponse", () => {
  it("detects rabbit_hole_detected for the active run summary", () => {
    const response = buildReportProgressResponse({
      activeRun: { runId: "run-1", proposalId: "proposal-1" },
      overview: {
        headsdownCall: { key: "all_contained" },
        runSummaries: [
          {
            runId: "run-1",
            callKey: "rabbit_hole_detected",
            allowedActionKeys: ["pause_and_summarize", "ALLOW_FOR_DURATION"],
          },
        ],
      },
      wrapUpGuidance: null,
    });

    expect(response).toEqual({
      reported: true,
      runId: "run-1",
      proposalRef: "proposal-1",
      rabbitHoleDetected: true,
      attentionWindowClosing: false,
      attentionWindow: null,
      allowedActionKeys: ["pause_and_summarize", "allow_for_duration"],
    });
  });

  it("resolves attention-window-closing state with wrap-up guidance", () => {
    const response = buildReportProgressResponse({
      activeRun: { runId: "run-7", proposalId: "proposal-7" },
      overview: {
        headsdownCall: { key: "attention_window_closing" },
        runSummaries: [
          {
            runId: "run-7",
            callKey: "attention_window_closing",
            allowedActionKeys: ["allow_for_duration", "pause_and_summarize"],
          },
        ],
      },
      wrapUpGuidance: {
        deadlineAt: "2026-04-29T18:00:00Z",
        thresholdMinutes: 30,
        remainingMinutes: 12,
        hints: ["land a minimal slice", "save a handoff"],
      },
    });

    expect(response.attentionWindowClosing).toBe(true);
    expect(response.rabbitHoleDetected).toBe(false);
    expect(response.attentionWindow).toEqual({
      deadlineAt: "2026-04-29T18:00:00Z",
      thresholdMinutes: 30,
      remainingMinutes: 12,
      hints: ["land a minimal slice", "save a handoff"],
    });
    expect(response.allowedActionKeys).toEqual(["allow_for_duration", "pause_and_summarize"]);
  });

  it("does not trigger rabbit-hole flow when only another run has that call", () => {
    const response = buildReportProgressResponse({
      activeRun: { runId: "run-1", proposalId: "proposal-1" },
      overview: {
        headsdownCall: { key: "rabbit_hole_detected" },
        runSummaries: [
          { runId: "run-2", callKey: "rabbit_hole_detected", allowedActionKeys: ["stop_run"] },
          { runId: "run-1", callKey: "good_to_run", allowedActionKeys: ["continue"] },
        ],
      },
      wrapUpGuidance: null,
    });

    expect(response.rabbitHoleDetected).toBe(false);
    expect(response.attentionWindowClosing).toBe(false);
    expect(response.attentionWindow).toBeNull();
    expect(response.allowedActionKeys).toEqual(["continue"]);
  });

  it("resolves a single actionable run when there is no active run", () => {
    const response = buildReportProgressResponse({
      activeRun: null,
      overview: {
        headsdownCall: {
          key: "ATTENTION_WINDOW_CLOSING",
          allowedActionKeys: ["pause_and_summarize", "allow_for_duration"],
        },
        runSummaries: [
          {
            runId: "run-window",
            callKey: "ATTENTION_WINDOW_CLOSING",
            allowedActionKeys: ["pause_and_summarize", "allow_for_duration", "allow_for_duration"],
          },
        ],
      },
      wrapUpGuidance: {
        deadlineAt: null,
        thresholdMinutes: 30,
        remainingMinutes: 20,
        hints: ["tighten scope"],
      },
    });

    expect(response.reported).toBe(true);
    expect(response.runId).toBe("run-window");
    expect(response.proposalRef).toBeNull();
    expect(response.attentionWindowClosing).toBe(true);
    expect(response.allowedActionKeys).toEqual(["pause_and_summarize", "allow_for_duration"]);
  });

  it("does not emit actionable state without a target run", () => {
    const response = buildReportProgressResponse({
      activeRun: null,
      overview: {
        headsdownCall: {
          key: "RABBIT_HOLE_DETECTED",
          allowedActionKeys: ["pause_and_summarize", "allow_for_duration"],
        },
        runSummaries: null,
      },
      wrapUpGuidance: null,
    });

    expect(response.runId).toBeNull();
    expect(response.rabbitHoleDetected).toBe(false);
    expect(response.attentionWindowClosing).toBe(false);
    expect(response.attentionWindow).toBeNull();
    expect(response.allowedActionKeys).toEqual([]);
  });
});
