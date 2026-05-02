import { describe, expect, it } from "vitest";
import { AUTOPILOT_CLASSIFIER_VERSION, type ClassifiedAction } from "@headsdown/sdk";
import { evaluateAntiStuck } from "../src/autopilot/anti-stuck.js";
import { claudeCodeIntegrationCapabilities } from "../src/autopilot/integration-capabilities.js";
import {
  buildAntiStuckNudgeText,
  buildClassifierPolicy,
  normalizeAutopilotDeferralConfig,
  selectEscalationStep,
} from "../src/autopilot/deferral.js";
import { DEFAULT_AUTOPILOT_STATE } from "../src/autopilot/state.js";

const classifiedAction: ClassifiedAction = {
  outcome: "notable",
  reasonCode: "ask_user_baseline",
  source: "deterministic",
  toolKind: "interaction.ask_user",
};

describe("anti-stuck nudges", () => {
  it("builds nudge text from SDK classifier fragments", () => {
    const config = normalizeAutopilotDeferralConfig({ houseRules: ["prefer local validation"] });
    const policy = buildClassifierPolicy(config);
    const escalation = selectEscalationStep({
      policy,
      capabilities: claudeCodeIntegrationCapabilities(new Date("2026-05-01T12:00:00.000Z")),
      classifiedAction,
      consecutiveNudges: 0,
      maxConsecutiveNudges: 4,
    });

    const text = buildAntiStuckNudgeText({
      policy,
      classifiedAction,
      escalation,
      houseRules: config.houseRules,
    });

    expect(text).toContain("Autopilot classifier addendum");
    expect(text).toContain("Anti-stuck nudge");
    expect(text).toContain("Defer this question");
    expect(text).toContain("Privacy reminder");
  });

  it("respects cooldown and consecutive nudge limits", () => {
    const config = normalizeAutopilotDeferralConfig({
      nudgeCooldownMs: 5_000,
      maxConsecutiveNudges: 1,
    });
    const capabilities = claudeCodeIntegrationCapabilities(new Date("2026-05-01T12:00:00.000Z"));

    expect(
      evaluateAntiStuck({
        mode: "offline",
        capabilities,
        matchedPattern: "should_i",
        autopilotState: {
          ...DEFAULT_AUTOPILOT_STATE,
          lastNudgedAt: 1_000,
          lastNudgedRunId: "run-1",
          lastNudgedToolCallCount: 2,
        },
        config,
        runId: "run-1",
        toolCallCount: 2,
        now: new Date(5_500),
      }),
    ).toMatchObject({
      shouldNudge: false,
      recordResolution: { reasonCode: "nudge_cooldown_active" },
    });

    expect(
      evaluateAntiStuck({
        mode: "offline",
        capabilities,
        matchedPattern: "should_i",
        autopilotState: {
          ...DEFAULT_AUTOPILOT_STATE,
          consecutiveNudges: 1,
          lastNudgedRunId: "run-1",
          lastNudgedToolCallCount: 2,
        },
        config,
        runId: "run-1",
        toolCallCount: 2,
        now: new Date(10_000),
      }),
    ).toMatchObject({
      shouldNudge: false,
      recordResolution: { reasonCode: "max_consecutive_nudges_reached" },
    });
  });

  it("resets the consecutive nudge streak when tool progress advances", () => {
    const config = normalizeAutopilotDeferralConfig({ maxConsecutiveNudges: 1 });
    const result = evaluateAntiStuck({
      mode: "offline",
      capabilities: claudeCodeIntegrationCapabilities(),
      matchedPattern: "should_i",
      autopilotState: {
        ...DEFAULT_AUTOPILOT_STATE,
        consecutiveNudges: 1,
        lastNudgedRunId: "run-1",
        lastNudgedToolCallCount: 2,
      },
      config,
      runId: "run-1",
      toolCallCount: 3,
      now: new Date(10_000),
    });

    expect(result.shouldNudge).toBe(true);
    expect(result.shouldNudge && result.updatedState.consecutiveNudges).toBe(1);
    expect(result.shouldNudge && result.updatedState.lastNudgedToolCallCount).toBe(3);
  });

  it.each(["hold", "verify", "balanced", "cautious", "lockdown"] as const)(
    "returns a non-empty escalation path for latitude %s",
    (latitudeDefault) => {
      const config = normalizeAutopilotDeferralConfig({ latitudeDefault });
      const result = selectEscalationStep({
        policy: buildClassifierPolicy(config),
        capabilities: claudeCodeIntegrationCapabilities(),
        classifiedAction,
        consecutiveNudges: 0,
        maxConsecutiveNudges: config.maxConsecutiveNudges,
      });

      expect(result.version.shouldProceed).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
    },
  );

  it("uses the current SDK classifier version in the static capability snapshot", () => {
    expect(claudeCodeIntegrationCapabilities().classifierVersion).toBe(
      AUTOPILOT_CLASSIFIER_VERSION,
    );
  });
});
