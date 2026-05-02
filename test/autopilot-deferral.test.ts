import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertLocalSessionSummary } from "@headsdown/sdk";
import {
  buildLocalSessionSummary,
  loadAutopilotDeferralConfig,
  normalizeAutopilotDeferralConfig,
  shouldRecordAutopilotDeferral,
} from "../src/autopilot/deferral.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hd-claude-autopilot-deferral-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env.HEADSDOWN_AUTOPILOT_CONFIG_PATH;
});

describe("autopilot deferral detection", () => {
  it.each([
    ["[DEFER] Need a human choice", "explicit_defer_marker", "high"],
    ["Should I rename this module before I continue?", "should_i", "normal"],
    ["Which would you prefer, keep REST or move to GraphQL?", "which_would_you_prefer", "normal"],
    ["I can do that next, let me know.", "let_me_know", "normal"],
    ["Awaiting your decision before proceeding.", "awaiting", "normal"],
  ])("matches the default pattern for %s", (message, pattern, urgencyBucket) => {
    const config = normalizeAutopilotDeferralConfig(null);

    expect(shouldRecordAutopilotDeferral({ message, mode: "offline", config })).toMatchObject({
      matched: true,
      pattern,
      urgencyBucket,
    });
  });

  it("does not match benign assistant narration", () => {
    const config = normalizeAutopilotDeferralConfig(null);

    expect(
      shouldRecordAutopilotDeferral({
        message: "I updated the implementation and verified the build locally.",
        mode: "offline",
        config,
      }),
    ).toMatchObject({ matched: false, pattern: null });
  });

  it("gates detection by availability mode and configuration", () => {
    const defaultConfig = normalizeAutopilotDeferralConfig(null);
    const limitedConfig = normalizeAutopilotDeferralConfig({ includeLimitedMode: true });
    const disabledConfig = normalizeAutopilotDeferralConfig({ enabled: false });
    const message = "Should I continue?";

    expect(
      shouldRecordAutopilotDeferral({ message, mode: "offline", config: defaultConfig }).matched,
    ).toBe(true);
    expect(
      shouldRecordAutopilotDeferral({ message, mode: "limited", config: defaultConfig }).matched,
    ).toBe(false);
    expect(
      shouldRecordAutopilotDeferral({ message, mode: "limited", config: limitedConfig }).matched,
    ).toBe(true);
    expect(
      shouldRecordAutopilotDeferral({ message, mode: "online", config: limitedConfig }).matched,
    ).toBe(false);
    expect(
      shouldRecordAutopilotDeferral({ message, mode: "offline", config: disabledConfig }).matched,
    ).toBe(false);
  });

  it("loads a custom config override without default patterns", async () => {
    const configPath = join(tempDir, "autopilot-config.json");
    process.env.HEADSDOWN_AUTOPILOT_CONFIG_PATH = configPath;
    await writeFile(
      configPath,
      JSON.stringify({ patterns: [{ key: "custom_marker", pattern: "HUMAN_GATE" }] }),
    );

    const config = await loadAutopilotDeferralConfig();

    expect(
      shouldRecordAutopilotDeferral({ message: "Should I continue?", mode: "offline", config })
        .matched,
    ).toBe(false);
    expect(
      shouldRecordAutopilotDeferral({ message: "HUMAN_GATE", mode: "offline", config }),
    ).toMatchObject({
      matched: true,
      pattern: "custom_marker",
    });
  });

  it("builds a privacy-safe LocalSessionSummary with clamped counts", () => {
    const summary = buildLocalSessionSummary({
      sessionId: "raw session with spaces",
      approvedProposalRef: "proposal/with/path-like-shape",
      toolCallCount: -1,
      fileChangeCount: 1.8,
      deferredDecisionCount: 2_000_000,
      continuationArtifactAvailable: true,
      validationLocallyPassed: false,
      now: new Date("2026-05-01T12:00:00.000Z"),
    });

    assertLocalSessionSummary(summary);
    expect(summary).toMatchObject({
      version: 1,
      generatedAt: "2026-05-01T12:00:00.000Z",
      toolCallCount: 0,
      fileChangeCount: 1,
      deferredDecisionCount: 1_000_000,
      continuationArtifactAvailable: true,
      validationLocallyPassed: false,
      outcomeCategory: "in_progress",
    });
    expect(summary.sessionId).toMatch(/^h_[a-f0-9]{40}$/);
    expect(summary.approvedProposalRef).toMatch(/^h_[a-f0-9]{40}$/);
  });

  it.each(["in_progress", "completed", "tabled", "deferred_for_review"] as const)(
    "accepts outcome category %s",
    (outcomeCategory) => {
      const summary = buildLocalSessionSummary({
        sessionId: "session",
        approvedProposalRef: null,
        toolCallCount: 0,
        fileChangeCount: 0,
        deferredDecisionCount: 0,
        continuationArtifactAvailable: false,
        validationLocallyPassed: false,
        outcomeCategory,
      });

      assertLocalSessionSummary(summary);
      expect(summary.outcomeCategory).toBe(outcomeCategory);
    },
  );
});
