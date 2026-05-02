import { HeadsDownClient } from "@headsdown/sdk";
import type { ActorContext, HeadsDownClient as HeadsDownClientType } from "@headsdown/sdk";
import { loadAutopilotDeferralConfig, type AutopilotDeferralConfig } from "./deferral.js";
import { AutopilotStateStore, type Mode } from "./state.js";
import {
  detectModeTransition,
  formatWakeUpDigestInstruction,
  shouldTriggerWakeUp,
  summarizeWakeUpDigest,
  unresolvedDeferredEntries,
} from "./wake-up-digest.js";

export interface WakeUpHandlerOptions {
  now?: Date;
  client?: HeadsDownClientType;
  clientFactory?: () => Promise<HeadsDownClientType>;
  stateStore?: AutopilotStateStore;
  configLoader?: () => Promise<AutopilotDeferralConfig>;
}

export interface WakeUpResult {
  emitted: boolean;
  skippedReason?: string;
  output?: Record<string, unknown>;
}

export async function runWakeUpFromStdin(): Promise<WakeUpResult> {
  await readStdin();
  const result = await handleWakeUp();
  if (result.output) console.log(JSON.stringify(result.output));
  return result;
}

export async function handleWakeUp(options: WakeUpHandlerOptions = {}): Promise<WakeUpResult> {
  const config = await (options.configLoader ?? loadAutopilotDeferralConfig)();
  const stateStore = options.stateStore ?? new AutopilotStateStore();
  const client = await resolveClient(options).catch(() => null);
  if (!client) return { emitted: false, skippedReason: "client_unavailable" };

  const now = options.now ?? new Date();
  const mode = await resolveMode({ client, stateStore, config, now }).catch(() => null);
  if (!mode) return { emitted: false, skippedReason: "mode_unavailable" };

  const state = await stateStore.load();
  const transition = detectModeTransition(state.lastObservedMode, mode);
  const shouldTrigger = shouldTriggerWakeUp(transition, mode);

  if (!shouldTrigger) {
    await stateStore.update((current) => ({ ...current, lastObservedMode: mode }));
    return { emitted: false, skippedReason: transition };
  }

  let events;
  try {
    events = await client.listAgentRunEvents({ limit: 100 });
  } catch {
    return { emitted: false, skippedReason: "events_unavailable" };
  }
  const entries = unresolvedDeferredEntries(events, state.surfacedDecisionIds);
  const instruction = formatWakeUpDigestInstruction(summarizeWakeUpDigest(entries));

  await stateStore.update((current) => ({
    ...current,
    lastObservedMode: mode,
    surfacedDecisionIds: [
      ...new Set([...current.surfacedDecisionIds, ...entries.map((entry) => entry.decisionId)]),
    ],
  }));

  if (!instruction) return { emitted: false, skippedReason: "empty" };

  return {
    emitted: true,
    output: {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: instruction,
      },
    },
  };
}

async function resolveClient(options: WakeUpHandlerOptions): Promise<HeadsDownClientType> {
  if (options.client) return options.client;
  if (options.clientFactory) return await options.clientFactory();

  const client = await HeadsDownClient.fromCredentials();
  const actorContext: ActorContext = {
    source: "claude-code",
    agentId: "claude-code:autopilot-wake-up",
    sessionId: process.env.CLAUDE_SESSION_ID,
    workspaceRef: "unknown",
  };
  return client.withActor(actorContext);
}

async function resolveMode(input: {
  client: HeadsDownClientType;
  stateStore: AutopilotStateStore;
  config: AutopilotDeferralConfig;
  now: Date;
}): Promise<Mode | null> {
  const nowMs = input.now.getTime();
  const availability = await input.client.getAvailability();
  const mode = normalizeMode((availability as { contract?: { mode?: unknown } }).contract?.mode);
  await input.stateStore.update((current) => ({
    ...current,
    lastObservedMode: current.lastObservedMode,
    modeCachedAt: nowMs,
    modeCacheValue: mode,
  }));
  return mode;
}

function normalizeMode(value: unknown): Mode | null {
  return typeof value === "string" && value.trim() ? (value.trim() as Mode) : null;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8");
}
