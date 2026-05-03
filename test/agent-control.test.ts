import { describe, expect, it } from "vitest";
import { renderHeadsDownCall } from "../src/agent-control.js";

const canonicalCalls = [
  "good_to_run",
  "keep_it_tight",
  "attention_window_closing",
  "not_worth_starting_now",
  "off_the_clock",
  "finish_line_friction",
  "rabbit_hole_detected",
  "ready_to_resume",
  "all_contained",
  "needs_your_yes",
];

describe("renderHeadsDownCall", () => {
  it("renders every canonical call without model-routing claims", () => {
    for (const key of canonicalCalls) {
      const rendered = renderHeadsDownCall({
        key,
        knownKey: key.toUpperCase(),
        title: key.replace(/_/g, " "),
        body: `Server body for ${key}.`,
        allowedActionKeys: ["ask_user"],
        allowedActionKnownKeys: ["ASK_USER"],
      });

      expect(rendered.key).toBe(key);
      expect(rendered.knownKey).toBe(key);
      expect(rendered.text).toContain("HeadsDown call:");
      expect(rendered.text).toContain(
        "Claude Code controls the model. HeadsDown controls the run.",
      );
      expect(rendered.text).not.toContain("HeadsDown picked the best Claude model");
      expect(rendered.safeFallback).toBe(false);
      expect(rendered.text).toContain("Allowed actions:");
    }
  });

  it("renders intervention calls with concise guidance", () => {
    for (const key of [
      "keep_it_tight",
      "not_worth_starting_now",
      "off_the_clock",
      "attention_window_closing",
      "needs_your_yes",
    ]) {
      const rendered = renderHeadsDownCall({
        key,
        knownKey: key.toUpperCase(),
        title: key.replace(/_/g, " "),
        body: `Server body for ${key}.`,
        allowedActionKeys: ["ask_user"],
        allowedActionKnownKeys: ["ASK_USER"],
      });

      expect(rendered.intervention).toBe(true);
      expect(rendered.text).toContain("HeadsDown call:");
      expect(rendered.text).toContain("Allowed actions: ask_user.");
      expect(rendered.text).not.toContain("Call:");
      expect(rendered.text).not.toContain("Trap:");
      expect(rendered.text).not.toContain("Play:");
      expect(rendered.text).not.toContain("Escalation:");
    }
  });

  it("renders ready_to_resume as a resumable state, not an intervention", () => {
    const rendered = renderHeadsDownCall({
      key: "ready_to_resume",
      knownKey: "READY_TO_RESUME",
      title: "Ready to resume",
      body: "HeadsDown saved the thread so Claude can pick up without starting over.",
      allowedActionKeys: ["resume_run"],
      allowedActionKnownKeys: ["RESUME_RUN"],
    });

    expect(rendered.intervention).toBe(false);
    expect(rendered.text).toContain("Ready to resume");
    expect(rendered.text).toContain("Allowed actions: resume_run.");
    expect(rendered.text).not.toContain("Trap:");
  });

  it("renders rabbit_hole_detected as a canonical SDK call", () => {
    const rendered = renderHeadsDownCall({
      key: "rabbit_hole_detected",
      knownKey: "RABBIT_HOLE_DETECTED",
      title: "Rabbit hole detected",
      body: "Pause before this becomes cleanup work.",
      allowedActionKeys: ["pause_and_summarize"],
    });

    expect(rendered.knownKey).toBe("rabbit_hole_detected");
    expect(rendered.safeFallback).toBe(false);
    expect(rendered.title).toBe("Rabbit hole detected");
    expect(rendered.text).toContain("Pause before this becomes cleanup work.");
    expect(rendered.text).toContain("Allowed actions: pause_and_summarize.");
  });

  it("renders attention_window_closing with extend and wrap action guidance", () => {
    const rendered = renderHeadsDownCall({
      key: "attention_window_closing",
      knownKey: "ATTENTION_WINDOW_CLOSING",
      title: "Window closing",
      body: "Your attention window is closing. Choose whether to extend or wrap with a summary while context is fresh.",
      allowedActionKeys: ["allow_for_duration", "pause_and_summarize"],
      allowedActionKnownKeys: ["ALLOW_FOR_DURATION", "PAUSE_AND_SUMMARIZE"],
      recommendedActionKnownKey: "ALLOW_FOR_DURATION",
      reasonCodes: ["window_closing"],
    });

    expect(rendered.intervention).toBe(true);
    expect(rendered.title).toBe("Window closing");
    expect(rendered.text).toContain("Your attention window is closing.");
    expect(rendered.text).toContain("Allowed actions: allow_for_duration, pause_and_summarize.");
    expect(rendered.text).not.toContain("Play:");
  });

  it("renders off_the_clock with queue_for_morning action guidance", () => {
    const rendered = renderHeadsDownCall({
      key: "off_the_clock",
      knownKey: "OFF_THE_CLOCK",
      title: "Off the clock",
      body: "Non-urgent agent decisions wait until your next work window.",
      allowedActionKeys: ["queue_for_morning", "keep_queued"],
      allowedActionKnownKeys: ["QUEUE_FOR_MORNING", "KEEP_QUEUED"],
      recommendedActionKnownKey: "QUEUE_FOR_MORNING",
      reasonCodes: ["off_hours"],
    });

    expect(rendered.intervention).toBe(true);
    expect(rendered.text).toContain("Off the clock");
    expect(rendered.text).toContain("Allowed actions: queue_for_morning, keep_queued.");
    expect(rendered.text).toContain("Claude Code controls the model. HeadsDown controls the run.");
  });

  it("uses server copy for unknown call keys while keeping SDK safe actions", () => {
    const rendered = renderHeadsDownCall({
      key: "future_call",
      title: "Future call",
      body: "Server-provided safe body.",
      allowedActionKeys: ["pause_and_summarize"],
      allowedActionKnownKeys: ["PAUSE_AND_SUMMARIZE"],
    });

    expect(rendered.safeFallback).toBe(true);
    expect(rendered.title).toBe("Future call");
    expect(rendered.text).toContain("Server-provided safe body.");
    expect(rendered.text).toContain("Allowed actions: pause_and_summarize.");
  });

  it("falls back safely for unknown call keys without server copy", () => {
    const rendered = renderHeadsDownCall({ key: "future_call" });

    expect(rendered.safeFallback).toBe(true);
    expect(rendered.title).toBe("Needs your yes");
    expect(rendered.text).toContain(
      "HeadsDown needs a human decision before this agent continues.",
    );
    expect(rendered.text).toContain("Allowed actions: none.");
  });
});
