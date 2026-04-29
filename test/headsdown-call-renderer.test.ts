import { describe, expect, it } from "vitest";
import {
  CANONICAL_HEADSDOWN_CALL_KEYS,
  renderHeadsDownCall,
  type CanonicalHeadsDownCallKey,
} from "../src/headsdown-call-renderer.js";

describe("renderHeadsDownCall", () => {
  it("renders every canonical call key with branded defaults", () => {
    const expected: Record<
      CanonicalHeadsDownCallKey,
      { title: string; primaryCta: string | null }
    > = {
      good_to_run: { title: "Good to run", primaryCta: "Let the agent proceed" },
      keep_it_tight: { title: "Keep it tight", primaryCta: "Narrow scope" },
      not_worth_starting_now: {
        title: "Not worth starting now",
        primaryCta: "Queue for later",
      },
      off_the_clock: { title: "Off the clock", primaryCta: "Queue for later" },
      ready_to_resume: { title: "Ready to resume", primaryCta: "Resume approved work" },
      needs_your_yes: { title: "Needs your yes", primaryCta: "Review request" },
    };

    for (const key of CANONICAL_HEADSDOWN_CALL_KEYS) {
      const rendered = renderHeadsDownCall({ key });
      expect(rendered).toBeTruthy();
      expect(rendered?.knownKey).toBe(key);
      expect(rendered?.fallback).toBe(false);
      expect(rendered?.title).toBe(expected[key].title);
      expect(rendered?.primaryCta).toBe(expected[key].primaryCta);
      expect(rendered?.summary).toContain(expected[key].title);
      if (expected[key].primaryCta) {
        expect(rendered?.summary).toContain(`Next move: ${expected[key].primaryCta}.`);
      } else {
        expect(rendered?.summary).not.toContain("Next move:");
      }
    }
  });

  it("supports camelCase call keys", () => {
    const rendered = renderHeadsDownCall({ key: "readyToResume" });
    expect(rendered?.knownKey).toBe("ready_to_resume");
    expect(rendered?.fallback).toBe(false);
  });

  it("uses backend-provided title/body/cta when present", () => {
    const rendered = renderHeadsDownCall({
      key: "keep_it_tight",
      title: "Backend title",
      body: "Backend body.",
      primaryActionLabel: "Backend CTA",
    });

    expect(rendered?.title).toBe("Backend title");
    expect(rendered?.body).toBe("Backend body.");
    expect(rendered?.primaryCta).toBe("Backend CTA");
    expect(rendered?.summary).toBe("Backend title. Backend body. Next move: Backend CTA.");
  });

  it("returns safe fallback for unknown keys", () => {
    const rendered = renderHeadsDownCall({ key: "totally_new_call" });
    expect(rendered?.key).toBe("totally_new_call");
    expect(rendered?.knownKey).toBeNull();
    expect(rendered?.fallback).toBe(true);
    expect(rendered?.title).toBe("Needs your yes");
    expect(rendered?.body).toBe("HeadsDown needs a human decision before this agent continues.");
    expect(rendered?.primaryCta).toBe("Review request");
    expect(rendered?.summary).toContain("Needs your yes");
  });

  it("treats deprecated call keys as safe fallback", () => {
    const rabbit = renderHeadsDownCall({
      key: "rabbit_hole_detected",
      title: "Rabbit hole detected",
      body: "Pause before this becomes cleanup work.",
      primaryActionLabel: "Pause + summarize",
    });
    const contained = renderHeadsDownCall({
      key: "all_contained",
      title: "All contained",
      body: "Nothing needs you right now.",
      primaryActionLabel: "Continue",
    });

    expect(rabbit?.knownKey).toBeNull();
    expect(rabbit?.fallback).toBe(true);
    expect(rabbit?.title).toBe("Needs your yes");
    expect(rabbit?.body).toBe("HeadsDown needs a human decision before this agent continues.");
    expect(rabbit?.primaryCta).toBe("Review request");

    expect(contained?.knownKey).toBeNull();
    expect(contained?.fallback).toBe(true);
    expect(contained?.title).toBe("Needs your yes");
    expect(contained?.body).toBe("HeadsDown needs a human decision before this agent continues.");
    expect(contained?.primaryCta).toBe("Review request");
  });

  it("does not use action-like server CTA copy for unknown keys", () => {
    const rendered = renderHeadsDownCall({
      key: "future_safe_to_continue",
      title: "Future call",
      body: "Future body.",
      primaryActionLabel: "Let the agent proceed",
    });

    expect(rendered?.fallback).toBe(true);
    expect(rendered?.title).toBe("Future call");
    expect(rendered?.body).toBe("Future body.");
    expect(rendered?.primaryCta).toBe("Review request");
    expect(rendered?.summary).toBe("Future call. Future body. Next move: Review request.");
  });

  it("returns null when no key is available", () => {
    expect(renderHeadsDownCall(null)).toBeNull();
    expect(renderHeadsDownCall({})).toBeNull();
    expect(renderHeadsDownCall({ key: "   " })).toBeNull();
  });
});
