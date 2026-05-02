import { AUTOPILOT_CLASSIFIER_VERSION, type IntegrationCapabilities } from "@headsdown/sdk";

export function claudeCodeIntegrationCapabilities(now = new Date()): IntegrationCapabilities {
  return {
    classifierVersion: AUTOPILOT_CLASSIFIER_VERSION,
    snapshotId: "claude-code-static-v1",
    capturedAt: now.toISOString(),
    stale: false,
    sandbox: {
      available: false,
      fsIsolation: "cwd_only",
      networkIsolation: "none",
      identityIsolation: "none",
    },
    toolKinds: ["bash", "edit", "webfetch", "mcp", "computer_use"],
    identityActionCategories: [],
  };
}
