import { describe, expect, it } from "vitest";
import { buildReportProgressResponse } from "../src/report-progress-response.js";

describe("buildReportProgressResponse", () => {
  it("uses the active run summary when present", () => {
    const response = buildReportProgressResponse({
      activeRun: { runId: "run-1", proposalId: "proposal-1" },
      overview: {
        headsdownCall: { key: "keep_it_tight" },
        runSummaries: [
          {
            runId: "run-2",
            callKey: "ready_to_resume",
            allowedActionKeys: ["resume_run"],
          },
          {
            runId: "run-1",
            callKey: "keep_it_tight",
            allowedActionKeys: ["NARROW_SCOPE", "ask_user", "ask_user"],
          },
        ],
      },
    });

    expect(response).toEqual({
      reported: true,
      runId: "run-1",
      proposalRef: "proposal-1",
      allowedActionKeys: ["narrow_scope", "ask_user"],
    });
  });

  it("falls back to the first run summary when there is no active run", () => {
    const response = buildReportProgressResponse({
      activeRun: null,
      overview: {
        headsdownCall: { key: "ready_to_resume" },
        runSummaries: [
          { runId: "run-ready", callKey: "ready_to_resume", allowedActionKeys: ["resume_run"] },
          { runId: "run-other", callKey: "keep_it_tight", allowedActionKeys: ["narrow_scope"] },
        ],
      },
    });

    expect(response).toEqual({
      reported: true,
      runId: "run-ready",
      proposalRef: null,
      allowedActionKeys: ["resume_run"],
    });
  });

  it("returns empty action context when there are no run summaries", () => {
    const response = buildReportProgressResponse({
      activeRun: null,
      overview: {
        headsdownCall: { key: "good_to_run" },
        runSummaries: null,
      },
    });

    expect(response).toEqual({
      reported: true,
      runId: null,
      proposalRef: null,
      allowedActionKeys: [],
    });
  });
});
