import { describe, expect, it } from "vitest";
import { renderHeadsDownCall } from "../src/agent-control.js";

const canonicalCalls = [
  "good_to_run",
  "keep_it_tight",
  "not_worth_starting_now",
  "off_the_clock",
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

  it("uses Call Trap Play Escalation structure for intervention calls", () => {
    for (const key of [
      "keep_it_tight",
      "not_worth_starting_now",
      "off_the_clock",
      "rabbit_hole_detected",
      "needs_your_yes",
    ]) {
      const rendered = renderHeadsDownCall({
        key,
        knownKey: key.toUpperCase(),
        title: key.replace(/_/g, " "),
        body: `Server body for ${key}.`,
        allowedActionKeys: ["ask_user"],
        allowedActionKnownKeys: ["ASK_USER"],
        recommendedActionKnownKey: "ASK_USER",
        reasonCodes: ["human_decision_needed"],
      });

      expect(rendered.intervention).toBe(true);
      expect(rendered.text).toContain("Call:");
      expect(rendered.text).toContain("Trap:");
      expect(rendered.text).toContain("Play:");
      expect(rendered.text).toContain("Use canonical action ask_user.");
      expect(rendered.text).toContain("Escalation:");
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

  it("renders rabbit-hole fallback copy from canonical key when knownKey is omitted", () => {
    const rendered = renderHeadsDownCall({
      key: "rabbit_hole_detected",
      allowedActionKeys: ["pause_and_summarize"],
    });

    expect(rendered.safeFallback).toBe(false);
    expect(rendered.title).toBe("Rabbit hole detected");
    expect(rendered.text).toContain(
      "Rabbit hole detected.\nPause before this becomes cleanup work.",
    );
    expect(rendered.text).toContain("Allowed actions: pause_and_summarize.");
    expect(rendered.text).toContain("Claude Code controls the model. HeadsDown controls the run.");
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
    expect(rendered.text).toContain("Use canonical action queue_for_morning.");
  });

  it("uses server copy for unknown call keys while keeping a safe fallback", () => {
    const rendered = renderHeadsDownCall({
      key: "future_call",
      title: "Future call",
      body: "Server-provided safe body.",
      allowedActionKeys: ["ask_user"],
      allowedActionKnownKeys: ["ASK_USER"],
    });

    expect(rendered.safeFallback).toBe(true);
    expect(rendered.title).toBe("Future call");
    expect(rendered.text).toContain("Server-provided safe body.");
    expect(rendered.text).toContain("Allowed actions: ask_user.");
  });

  it("falls back safely for unknown call keys without server copy", () => {
    const rendered = renderHeadsDownCall({ key: "future_call" });

    expect(rendered.safeFallback).toBe(true);
    expect(rendered.title).toBe("Needs your yes");
    expect(rendered.text).toContain("does not recognize");
    expect(rendered.text).toContain("Ask before going deeper");
    expect(rendered.text).toContain("Allowed actions: none.");
  });
});
