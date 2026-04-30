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
      attentionWindowClosing: false,
      attentionWindow: null,
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
      attentionWindowClosing: false,
      attentionWindow: null,
      allowedActionKeys: ["resume_run"],
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

    expect(response).toEqual({
      reported: true,
      runId: "run-7",
      proposalRef: "proposal-7",
      attentionWindowClosing: true,
      attentionWindow: {
        deadlineAt: "2026-04-29T18:00:00Z",
        thresholdMinutes: 30,
        remainingMinutes: 12,
        hints: ["land a minimal slice", "save a handoff"],
      },
      allowedActionKeys: ["allow_for_duration", "pause_and_summarize"],
    });
  });

  it("resolves a single attention-window-closing run when there is no active run", () => {
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
    expect(response.attentionWindow).toEqual({
      deadlineAt: null,
      thresholdMinutes: 30,
      remainingMinutes: 20,
      hints: ["tighten scope"],
    });
    expect(response.allowedActionKeys).toEqual(["pause_and_summarize", "allow_for_duration"]);
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
      attentionWindowClosing: false,
      attentionWindow: null,
      allowedActionKeys: [],
    });
  });
});
