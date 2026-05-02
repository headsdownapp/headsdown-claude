import type { ClassifiedAction, ClassifierPolicy, IntegrationCapabilities } from "@headsdown/sdk";
import type { StopHookInput } from "./detect-deferral-handler.js";
import type { AutopilotDeferralConfig } from "./deferral.js";
import {
  buildAntiStuckNudgeText,
  buildClassifierPolicy,
  classifyAskUserPattern,
  selectEscalationStep,
} from "./deferral.js";
import type { AutopilotState } from "./state.js";

export interface AntiStuckEvaluationInput {
  stopHookInput?: StopHookInput;
  mode: string | null | undefined;
  policy?: ClassifierPolicy;
  capabilities: IntegrationCapabilities;
  classifiedAction?: ClassifiedAction;
  matchedPattern: string;
  autopilotState: AutopilotState;
  config: AutopilotDeferralConfig;
  runId: string;
  toolCallCount: number;
  now?: Date;
}

export type AntiStuckEvaluation =
  | { shouldNudge: true; nudgeText: string; updatedState: AutopilotState }
  | { shouldNudge: false; recordResolution?: { reasonCode: string } };

export function evaluateAntiStuck(input: AntiStuckEvaluationInput): AntiStuckEvaluation {
  if (input.mode !== "offline" && !(input.mode === "limited" && input.config.includeLimitedMode)) {
    return { shouldNudge: false };
  }

  const sameStreak =
    input.autopilotState.lastNudgedRunId === input.runId &&
    input.autopilotState.lastNudgedToolCallCount === input.toolCallCount;
  const consecutiveNudges = sameStreak ? input.autopilotState.consecutiveNudges : 0;
  const nowMs = (input.now ?? new Date()).getTime();

  if (
    sameStreak &&
    input.autopilotState.lastNudgedAt !== null &&
    nowMs - input.autopilotState.lastNudgedAt < input.config.nudgeCooldownMs
  ) {
    return { shouldNudge: false, recordResolution: { reasonCode: "nudge_cooldown_active" } };
  }

  const policy = input.policy ?? buildClassifierPolicy(input.config);
  const classifiedAction = input.classifiedAction ?? classifyAskUserPattern(input.matchedPattern);
  const escalation = selectEscalationStep({
    policy,
    capabilities: input.capabilities,
    classifiedAction,
    consecutiveNudges,
    maxConsecutiveNudges: input.config.maxConsecutiveNudges,
  });

  if (escalation.reasonCode === "max_consecutive_nudges_reached") {
    return { shouldNudge: false, recordResolution: { reasonCode: escalation.reasonCode } };
  }

  return {
    shouldNudge: true,
    nudgeText: buildAntiStuckNudgeText({
      policy,
      classifiedAction,
      escalation,
      identityActionOverrides: input.config.identityActionOverrides,
      houseRules: input.config.houseRules,
    }),
    updatedState: {
      ...input.autopilotState,
      lastNudgedAt: nowMs,
      lastNudgedRunId: input.runId,
      lastNudgedToolCallCount: input.toolCallCount,
      consecutiveNudges: consecutiveNudges + 1,
    },
  };
}
