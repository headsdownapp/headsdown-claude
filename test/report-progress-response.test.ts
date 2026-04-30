import { describe, expect, it } from "vitest";
import { buildReportProgressResponse } from "../src/report-progress-response.js";
import { createTimeBox } from "../src/time-box.js";

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
        source: "backend",
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
      source: "backend",
    });
    expect(response.allowedActionKeys).toEqual(["pause_and_summarize", "allow_for_duration"]);
  });

  it("falls back to overview call state when the active run summary is missing", () => {
    const response = buildReportProgressResponse({
      activeRun: { runId: "run-404", proposalId: "proposal-404" },
      overview: {
        headsdownCall: {
          key: "attention_window_closing",
          allowedActionKeys: ["pause_and_summarize", "allow_for_duration", "pause_and_summarize"],
        },
        runSummaries: [
          { runId: "run-other", callKey: "keep_it_tight", allowedActionKeys: ["narrow_scope"] },
        ],
      },
      wrapUpGuidance: {
        deadlineAt: "2026-04-29T18:00:00Z",
        thresholdMinutes: 30,
        remainingMinutes: 8,
        hints: ["handoff soon"],
      },
    });

    expect(response).toEqual({
      reported: true,
      runId: "run-404",
      proposalRef: "proposal-404",
      attentionWindowClosing: true,
      attentionWindow: {
        deadlineAt: "2026-04-29T18:00:00Z",
        thresholdMinutes: 30,
        remainingMinutes: 8,
        hints: ["handoff soon"],
        source: "backend",
      },
      allowedActionKeys: ["pause_and_summarize", "allow_for_duration"],
    });
  });

  it("uses overview call actions when there are no run summaries", () => {
    const response = buildReportProgressResponse({
      activeRun: null,
      overview: {
        headsdownCall: { key: "good_to_run", allowedActionKeys: ["narrow_scope", "ask_user"] },
        runSummaries: null,
      },
    });

    expect(response).toEqual({
      reported: true,
      runId: null,
      proposalRef: null,
      attentionWindowClosing: false,
      attentionWindow: null,
      allowedActionKeys: ["narrow_scope", "ask_user"],
    });
  });

  it("drops invalid attention window values instead of leaking nonsense countdown data", () => {
    const response = buildReportProgressResponse({
      activeRun: null,
      overview: {
        headsdownCall: { key: "attention_window_closing" },
        runSummaries: null,
      },
      wrapUpGuidance: {
        deadlineAt: "not a timestamp",
        thresholdMinutes: Number.NaN,
        remainingMinutes: -1,
        hints: [" keep ", ""],
      },
    });

    expect(response.attentionWindowClosing).toBe(true);
    expect(response.attentionWindow).toEqual({
      deadlineAt: null,
      thresholdMinutes: null,
      remainingMinutes: null,
      hints: ["keep"],
      source: "backend",
    });
  });

  it("uses an earlier box deadline for attention-window context", () => {
    const timeBox = createTimeBox({
      durationText: "30m",
      sessionIdHash: "session-hash",
      now: new Date("2026-04-29T16:00:00Z"),
    });

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
        deadlineAt: "2026-04-29T17:00:00Z",
        thresholdMinutes: 30,
        remainingMinutes: 60,
        hints: ["backend hint"],
      },
      timeBox,
      now: new Date("2026-04-29T16:10:00Z"),
    });

    expect(response.attentionWindowClosing).toBe(true);
    expect(response.attentionWindow).toEqual({
      deadlineAt: "2026-04-29T16:30:00.000Z",
      thresholdMinutes: 15,
      remainingMinutes: 20,
      hints: [
        "backend hint",
        "Self-declared box is active. Keep scope tight before the deadline; do not stop automatically when it passes.",
      ],
      source: "time_box",
    });
  });

  it("can surface a local box warning even before backend call state changes", () => {
    const timeBox = createTimeBox({
      durationText: "30m",
      sessionIdHash: "session-hash",
      now: new Date("2026-04-29T16:00:00Z"),
    });

    const response = buildReportProgressResponse({
      activeRun: { runId: "run-7", proposalId: "proposal-7" },
      overview: {
        headsdownCall: { key: "good_to_run" },
        runSummaries: [
          {
            runId: "run-7",
            callKey: "good_to_run",
            allowedActionKeys: ["narrow_scope"],
          },
        ],
      },
      timeBox,
      now: new Date("2026-04-29T16:20:00Z"),
    });

    expect(response.attentionWindowClosing).toBe(true);
    expect(response.attentionWindow).toMatchObject({
      deadlineAt: "2026-04-29T16:30:00.000Z",
      thresholdMinutes: 15,
      remainingMinutes: 10,
      source: "time_box",
    });
    expect(response.allowedActionKeys).toEqual(["narrow_scope"]);
  });
});
