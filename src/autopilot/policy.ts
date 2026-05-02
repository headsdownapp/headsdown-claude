import {
  AUTOPILOT_CLASSIFIER_VERSION,
  buildClassifierPromptFragments,
  evaluateClassifierVersionCompatibility,
  fetchAutopilotPolicy as fetchSdkAutopilotPolicy,
  type ClassifierPolicy,
  type HeadsDownClient,
  type Mode as SdkMode,
} from "@headsdown/sdk";
import type { Mode } from "./state.js";
import type { AutopilotDeferralConfig } from "./deferral.js";

export { fetchSdkAutopilotPolicy as fetchAutopilotPolicy };

export interface AutopilotPolicyLoadResult {
  active: boolean;
  policy?: ClassifierPolicy;
  skippedReason?: "not_autopilot" | "policy_unavailable";
  error?: string;
}

export interface AutopilotPromptRenderResult {
  additionalContext: string;
  classifierVersion: string;
  mismatchLevel: "none" | "warning" | "error";
}

export function isAutopilotMode(
  mode: Mode | string | null | undefined,
  config: Pick<AutopilotDeferralConfig, "enabled" | "includeLimitedMode">,
): boolean {
  if (!config.enabled) return false;
  return mode === "offline" || (mode === "limited" && config.includeLimitedMode);
}

export async function loadFreshAutopilotPolicy(input: {
  client: HeadsDownClient;
  mode: Mode | string | null | undefined;
  config: Pick<AutopilotDeferralConfig, "enabled" | "includeLimitedMode">;
}): Promise<AutopilotPolicyLoadResult> {
  if (!isAutopilotMode(input.mode, input.config)) {
    return { active: false, skippedReason: "not_autopilot" };
  }

  try {
    const policy = await fetchSdkAutopilotPolicy(input.client, input.mode as SdkMode);
    return { active: true, policy };
  } catch (error) {
    return { active: true, skippedReason: "policy_unavailable", error: safeErrorMessage(error) };
  }
}

export function renderAutopilotPolicyUnavailableAddendum(): string {
  return [
    "[HeadsDown Autopilot] Autopilot mode is active, but the hosted autopilot policy could not be loaded for this turn.",
    "Behave conservatively: continue with reversible, low-risk work only, avoid user prompts while the user is offline, and defer decisions that require human input until policy loading recovers.",
    "Do not assume permission for destructive, public, identity-bound, or irreversible actions.",
  ].join("\n");
}

export function renderAutopilotPromptAddendum(
  policy: ClassifierPolicy,
): AutopilotPromptRenderResult {
  const version = evaluateClassifierVersionCompatibility({
    sdkVersion: AUTOPILOT_CLASSIFIER_VERSION,
    policyVersion: policy.classifierVersion,
  });

  if (!version.shouldProceed || version.level === "error") {
    return {
      classifierVersion: policy.classifierVersion,
      mismatchLevel: version.level,
      additionalContext: [
        "[HeadsDown Autopilot] Autopilot policy could not be applied safely because the hosted classifier policy version does not match this integration.",
        `SDK classifier version: ${AUTOPILOT_CLASSIFIER_VERSION}. Policy classifier version: ${policy.classifierVersion}.`,
        `Compatibility: ${version.direction}. ${version.message}`,
        "Behave conservatively: continue with reversible, low-risk work only, avoid user prompts when offline, and defer decisions that require human input until the integration is updated.",
      ].join("\n"),
    };
  }

  const fragments = buildClassifierPromptFragments({
    latitude: policy.latitude,
    identityActionOverrides: policy.identityActionOverrides,
    houseRules: policy.houseRules,
  });

  const warning = version.level === "warning" ? `\n\n[HeadsDown Autopilot] ${version.message}` : "";

  return {
    additionalContext: fragments.fullSystemAddendum + warning,
    classifierVersion: policy.classifierVersion,
    mismatchLevel: version.level,
  };
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : String(error);
}
