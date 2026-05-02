import { HeadsDownClient, type ActorContext } from "@headsdown/sdk";
import { loadAutopilotDeferralConfig, type AutopilotDeferralConfig } from "./deferral.js";
import { AutopilotStateStore, type Mode } from "./state.js";
import {
  loadFreshAutopilotPolicy,
  renderAutopilotPolicyUnavailableAddendum,
  renderAutopilotPromptAddendum,
} from "./policy.js";

export interface UserPromptSubmitHookInput {
  session_id?: string;
  hook_event_name?: string;
  [key: string]: unknown;
}

export interface AutopilotPromptHandlerOptions {
  now?: Date;
  client?: HeadsDownClient;
  clientFactory?: () => Promise<HeadsDownClient>;
  stateStore?: AutopilotStateStore;
  configLoader?: () => Promise<AutopilotDeferralConfig>;
  asSessionContext?: boolean;
}

export interface AutopilotPromptResult {
  injected: boolean;
  skippedReason?: string;
  output?: Record<string, unknown>;
  mode?: Mode | null;
  classifierVersion?: string;
  mismatchLevel?: "none" | "warning" | "error";
}

export async function runAutopilotPromptFromStdin(args = process.argv.slice(4)): Promise<void> {
  const raw = await readStdin();
  const input = parseHookInput(raw);
  const result = await handleAutopilotPrompt(input, {
    asSessionContext: args.includes("--as-session-context"),
  });
  if (result.output) {
    process.stdout.write(`${JSON.stringify(result.output)}\n`);
  }
}

export async function handleAutopilotPrompt(
  input: UserPromptSubmitHookInput,
  options: AutopilotPromptHandlerOptions = {},
): Promise<AutopilotPromptResult> {
  const config = await (options.configLoader ?? loadAutopilotDeferralConfig)();
  if (!config.enabled) return { injected: false, skippedReason: "disabled" };

  const client = await resolveClient(input, options).catch(() => null);
  if (!client) return { injected: false, skippedReason: "client_unavailable" };

  const stateStore = options.stateStore ?? new AutopilotStateStore();
  const mode = await resolveMode({
    client,
    stateStore,
    config,
    now: options.now ?? new Date(),
  }).catch(() => null);
  if (!mode) return { injected: false, skippedReason: "mode_unavailable" };

  const policyLoad = await loadFreshAutopilotPolicy({ client, mode, config });
  if (!policyLoad.active) {
    return {
      injected: false,
      skippedReason: policyLoad.skippedReason ?? "not_autopilot",
      mode,
    };
  }

  const hookEventName = options.asSessionContext ? "SessionStart" : "UserPromptSubmit";
  if (!policyLoad.policy) {
    return {
      injected: true,
      skippedReason: policyLoad.skippedReason ?? "policy_unavailable",
      mode,
      mismatchLevel: "error",
      output: buildHookOutput(hookEventName, renderAutopilotPolicyUnavailableAddendum()),
    };
  }

  const rendered = renderAutopilotPromptAddendum(policyLoad.policy);

  return {
    injected: true,
    mode,
    classifierVersion: rendered.classifierVersion,
    mismatchLevel: rendered.mismatchLevel,
    output: buildHookOutput(hookEventName, rendered.additionalContext),
  };
}

function buildHookOutput(
  hookEventName: string,
  additionalContext: string,
): Record<string, unknown> {
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext,
    },
  };
}

async function resolveClient(
  input: UserPromptSubmitHookInput,
  options: AutopilotPromptHandlerOptions,
): Promise<HeadsDownClient> {
  if (options.client) return options.client;
  if (options.clientFactory) return await options.clientFactory();
  const client = await HeadsDownClient.fromCredentials();
  const actorContext: ActorContext = {
    source: "claude-code",
    agentId: "claude-code:autopilot-prompt",
    sessionId:
      typeof input.session_id === "string" ? input.session_id : process.env.CLAUDE_SESSION_ID,
    workspaceRef: "unknown",
  };
  return client.withActor(actorContext);
}

async function resolveMode(input: {
  client: HeadsDownClient;
  stateStore: AutopilotStateStore;
  config: AutopilotDeferralConfig;
  now: Date;
}): Promise<Mode | null> {
  const state = await input.stateStore.load();
  const nowMs = input.now.getTime();
  if (
    state.modeCachedAt !== null &&
    state.modeCacheValue !== null &&
    nowMs - state.modeCachedAt < input.config.modeCacheMs
  ) {
    return state.modeCacheValue;
  }

  const availability = await input.client.getAvailability();
  const mode = normalizeMode((availability as { contract?: { mode?: unknown } }).contract?.mode);
  await input.stateStore.update((current) => ({
    ...current,
    lastObservedMode: mode,
    modeCachedAt: nowMs,
    modeCacheValue: mode,
  }));
  return mode;
}

function parseHookInput(raw: string): UserPromptSubmitHookInput {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as UserPromptSubmitHookInput) : {};
  } catch {
    return {};
  }
}

function normalizeMode(value: unknown): Mode | null {
  return typeof value === "string" && value.trim() ? (value.trim() as Mode) : null;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}
