import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HeadsDownClient, type HeadsDownClient as HeadsDownClientType } from "@headsdown/sdk";
import type { AutopilotDeferralConfig } from "../src/autopilot/deferral.js";
import { handleAutopilotPrompt } from "../src/autopilot/prompt-handler.js";
import { AutopilotStateStore } from "../src/autopilot/state.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hd-claude-autopilot-prompt-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("handleAutopilotPrompt", () => {
  it("injects SDK-rendered autopilot context in offline mode", async () => {
    const request = vi.fn(async () => ({ autopilotPolicy: policyResponse() }));
    const result = await handleAutopilotPrompt(
      { session_id: "session-offline" },
      {
        client: mockClient({ mode: "offline", request }),
        stateStore: new AutopilotStateStore(join(tempDir, "state.json")),
        configLoader: async () => config(),
        now: new Date("2026-05-01T12:00:00.000Z"),
      },
    );

    expect(result.injected).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toEqual({ mode: "OFFLINE" });
    expect(result.output).toMatchObject({
      hookSpecificOutput: { hookEventName: "UserPromptSubmit" },
    });
    const additionalContext = String(
      (result.output?.hookSpecificOutput as Record<string, unknown>).additionalContext,
    );
    expect(additionalContext).toContain("Autopilot classifier addendum");
    expect(additionalContext).toContain("balanced");
    expect(additionalContext).toContain("deploy:defer_for_human_review");
    expect(additionalContext).toContain("Prefer local validation");
  });

  it("does not inject in online mode", async () => {
    const request = vi.fn(async () => ({ autopilotPolicy: policyResponse() }));
    const result = await handleAutopilotPrompt(
      { session_id: "session-online" },
      {
        client: mockClient({ mode: "online", request }),
        stateStore: new AutopilotStateStore(join(tempDir, "online-state.json")),
        configLoader: async () => config(),
      },
    );

    expect(result).toMatchObject({ injected: false, skippedReason: "not_autopilot" });
    expect(request).not.toHaveBeenCalled();
  });

  it("respects limited-mode opt-in", async () => {
    const request = vi.fn(async () => ({ autopilotPolicy: policyResponse() }));
    const stateStore = new AutopilotStateStore(join(tempDir, "limited-state.json"));

    const defaultResult = await handleAutopilotPrompt(
      { session_id: "session-limited" },
      {
        client: mockClient({ mode: "limited", request }),
        stateStore,
        configLoader: async () => config({ includeLimitedMode: false }),
        now: new Date("2026-05-01T12:00:00.000Z"),
      },
    );
    expect(defaultResult.injected).toBe(false);

    const optInResult = await handleAutopilotPrompt(
      { session_id: "session-limited" },
      {
        client: mockClient({ mode: "limited", request }),
        stateStore,
        configLoader: async () => config({ includeLimitedMode: true }),
        now: new Date("2026-05-01T12:01:01.000Z"),
      },
    );
    expect(optInResult.injected).toBe(true);
  });

  it("renders SessionStart-shaped output for first-turn preload", async () => {
    const result = await handleAutopilotPrompt(
      { session_id: "session-start" },
      {
        client: mockClient({ mode: "offline" }),
        stateStore: new AutopilotStateStore(join(tempDir, "session-state.json")),
        configLoader: async () => config(),
        asSessionContext: true,
      },
    );

    expect(result.output).toMatchObject({
      hookSpecificOutput: { hookEventName: "SessionStart" },
    });
  });

  it("reads policy fresh on each prompt while reusing the shared mode cache", async () => {
    const request = vi.fn(async () => ({ autopilotPolicy: policyResponse() }));
    const getAvailability = vi.fn(async () => ({ contract: { mode: "offline" }, schedule: {} }));
    const stateStore = new AutopilotStateStore(join(tempDir, "fresh-state.json"));
    const client = mockClient({ mode: "offline", request, getAvailability });
    const options = {
      client,
      stateStore,
      configLoader: async () => config(),
      now: new Date("2026-05-01T12:00:00.000Z"),
    };

    const first = await handleAutopilotPrompt({ session_id: "session-fresh" }, options);
    request.mockResolvedValueOnce({
      autopilotPolicy: policyResponse({ houseRules: "Use the freshly fetched policy" }),
    });
    const second = await handleAutopilotPrompt({ session_id: "session-fresh" }, options);

    expect(getAvailability).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(
      String((first.output?.hookSpecificOutput as Record<string, unknown>).additionalContext),
    ).not.toContain("Use the freshly fetched policy");
    expect(
      String((second.output?.hookSpecificOutput as Record<string, unknown>).additionalContext),
    ).toContain("Use the freshly fetched policy");
  });

  it("emits conservative autopilot context when policy loading fails", async () => {
    const result = await handleAutopilotPrompt(
      { session_id: "session-policy-failure" },
      {
        client: mockClient({
          mode: "offline",
          request: vi.fn(async () => {
            throw new Error("network unavailable");
          }),
        }),
        stateStore: new AutopilotStateStore(join(tempDir, "policy-failure-state.json")),
        configLoader: async () => config(),
      },
    );

    expect(result).toMatchObject({
      injected: true,
      skippedReason: "policy_unavailable",
      mismatchLevel: "error",
    });
    const additionalContext = String(
      (result.output?.hookSpecificOutput as Record<string, unknown>).additionalContext,
    );
    expect(additionalContext).toContain("policy could not be loaded");
    expect(additionalContext).toContain("Do not assume permission");
  });

  it("uses the SDK-authenticated client path with actor context by default", async () => {
    const withActor = vi.fn((actorContext) =>
      mockClient({
        mode: "offline",
        request: vi.fn(async () => ({ autopilotPolicy: policyResponse() })),
      }),
    );
    vi.spyOn(HeadsDownClient, "fromCredentials").mockResolvedValue({ withActor } as never);

    const result = await handleAutopilotPrompt(
      { session_id: "session-actor" },
      {
        stateStore: new AutopilotStateStore(join(tempDir, "actor-state.json")),
        configLoader: async () => config(),
      },
    );

    expect(result.injected).toBe(true);
    expect(withActor).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "claude-code",
        agentId: "claude-code:autopilot-prompt",
        sessionId: "session-actor",
      }),
    );
  });

  it("emits a clear context message on classifier version mismatch", async () => {
    const result = await handleAutopilotPrompt(
      { session_id: "session-mismatch" },
      {
        client: mockClient({
          mode: "offline",
          request: vi.fn(async () => ({
            autopilotPolicy: policyResponse({ classifierVersion: "2.0.0" }),
          })),
        }),
        stateStore: new AutopilotStateStore(join(tempDir, "mismatch-state.json")),
        configLoader: async () => config(),
      },
    );

    expect(result.injected).toBe(true);
    expect(result.mismatchLevel).toBe("error");
    const additionalContext = String(
      (result.output?.hookSpecificOutput as Record<string, unknown>).additionalContext,
    );
    expect(additionalContext).toContain("does not match this integration");
    expect(additionalContext).toContain("2.0.0");
  });
});

function mockClient(input: {
  mode: string;
  request?: ReturnType<typeof vi.fn>;
  getAvailability?: ReturnType<typeof vi.fn>;
}): HeadsDownClientType {
  return {
    getAvailability:
      input.getAvailability ??
      vi.fn(async () => ({ contract: { mode: input.mode }, schedule: {} })),
    graphql: {
      request: input.request ?? vi.fn(async () => ({ autopilotPolicy: policyResponse() })),
    },
  } as unknown as HeadsDownClient;
}

function policyResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    classifierVersion: "1.1.0",
    latitude: "BALANCED",
    escalationStrategy: ["TRY_ALTERNATIVE", "DEFER_FOR_HUMAN_REVIEW"],
    sandboxPreference: "OPTIONAL",
    identityActionOverrides: [{ actionKey: "deploy", strategy: "DEFER_FOR_HUMAN_REVIEW" }],
    houseRules: "Prefer local validation",
    ...overrides,
  };
}

function config(overrides: Partial<AutopilotDeferralConfig> = {}): AutopilotDeferralConfig {
  return {
    enabled: true,
    includeLimitedMode: false,
    defaultUrgencyBucket: "normal" as const,
    modeCacheMs: 60_000,
    nudgeCooldownMs: 5_000,
    maxConsecutiveNudges: 4,
    latitudeDefault: "balanced" as const,
    identityActionOverrides: [],
    houseRules: [],
    patterns: [],
    ...overrides,
  };
}
