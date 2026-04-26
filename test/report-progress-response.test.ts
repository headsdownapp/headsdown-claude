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
    });

    expect(response).toEqual({
      reported: true,
      runId: "run-1",
      proposalRef: "proposal-1",
      rabbitHoleDetected: true,
      allowedActionKeys: ["pause_and_summarize", "allow_for_duration"],
    });
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
    });

    expect(response.rabbitHoleDetected).toBe(false);
    expect(response.allowedActionKeys).toEqual(["continue"]);
  });

  it("resolves a single rabbit-hole run when there is no active run", () => {
    const response = buildReportProgressResponse({
      activeRun: null,
      overview: {
        headsdownCall: {
          key: "RABBIT_HOLE_DETECTED",
          allowedActionKeys: ["pause_and_summarize", "allow_for_duration"],
        },
        runSummaries: [
          {
            runId: "run-rabbit",
            callKey: "RABBIT_HOLE_DETECTED",
            allowedActionKeys: ["pause_and_summarize", "allow_for_duration", "allow_for_duration"],
          },
        ],
      },
    });

    expect(response.reported).toBe(true);
    expect(response.runId).toBe("run-rabbit");
    expect(response.proposalRef).toBeNull();
    expect(response.rabbitHoleDetected).toBe(true);
    expect(response.allowedActionKeys).toEqual(["pause_and_summarize", "allow_for_duration"]);
  });

  it("does not emit actionable rabbit-hole state without a target run", () => {
    const response = buildReportProgressResponse({
      activeRun: null,
      overview: {
        headsdownCall: {
          key: "RABBIT_HOLE_DETECTED",
          allowedActionKeys: ["pause_and_summarize", "allow_for_duration"],
        },
        runSummaries: null,
      },
    });

    expect(response.runId).toBeNull();
    expect(response.rabbitHoleDetected).toBe(false);
    expect(response.allowedActionKeys).toEqual([]);
  });
});
