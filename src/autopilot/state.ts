import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type Mode = "online" | "busy" | "limited" | "offline" | (string & {});

// Flat persisted schema shared by the autopilot slices. Later actions reuse these top-level fields, so loaders normalize unknown or missing fields without nesting action-specific state.
export interface AutopilotState {
  lastObservedMode: Mode | null;
  lastNudgedAt: number | null;
  surfacedDecisionIds: string[];
  deferredDecisionCount: number;
  consecutiveNudges: number;
  lastNudgedRunId: string | null;
  lastNudgedToolCallCount: number | null;
  lastSeenDeferralKey: string | null;
  modeCachedAt: number | null;
  modeCacheValue: Mode | null;
}

export const DEFAULT_AUTOPILOT_STATE: AutopilotState = {
  lastObservedMode: null,
  lastNudgedAt: null,
  surfacedDecisionIds: [],
  deferredDecisionCount: 0,
  consecutiveNudges: 0,
  lastNudgedRunId: null,
  lastNudgedToolCallCount: null,
  lastSeenDeferralKey: null,
  modeCachedAt: null,
  modeCacheValue: null,
};

export function autopilotStatePath(): string {
  const override = process.env.HEADSDOWN_AUTOPILOT_STATE_PATH?.trim();
  if (override) return override;
  return join(homedir(), ".config", "headsdown", "autopilot-state.json");
}

export class AutopilotStateStore {
  constructor(private readonly path = autopilotStatePath()) {}

  async load(): Promise<AutopilotState> {
    try {
      await access(this.path);
    } catch {
      return { ...DEFAULT_AUTOPILOT_STATE, surfacedDecisionIds: [] };
    }

    try {
      const raw = await readFile(this.path, "utf-8");
      return normalizeAutopilotState(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_AUTOPILOT_STATE, surfacedDecisionIds: [] };
    }
  }

  async save(state: AutopilotState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(normalizeAutopilotState(state), null, 2), {
      mode: 0o600,
    });
    await chmod(this.path, 0o600).catch(() => undefined);
  }

  async update(updater: (current: AutopilotState) => AutopilotState): Promise<AutopilotState> {
    const next = normalizeAutopilotState(updater(await this.load()));
    await this.save(next);
    return next;
  }
}

function normalizeAutopilotState(value: unknown): AutopilotState {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    lastObservedMode: normalizeMode(raw.lastObservedMode),
    lastNudgedAt: normalizeNullableTimestamp(raw.lastNudgedAt),
    surfacedDecisionIds: Array.isArray(raw.surfacedDecisionIds)
      ? raw.surfacedDecisionIds.filter((id): id is string => typeof id === "string")
      : [],
    deferredDecisionCount: normalizeCount(raw.deferredDecisionCount),
    consecutiveNudges: normalizeCount(raw.consecutiveNudges),
    lastNudgedRunId:
      typeof raw.lastNudgedRunId === "string" && raw.lastNudgedRunId.trim()
        ? raw.lastNudgedRunId.trim()
        : null,
    lastNudgedToolCallCount:
      typeof raw.lastNudgedToolCallCount === "number" &&
      Number.isFinite(raw.lastNudgedToolCallCount) &&
      raw.lastNudgedToolCallCount >= 0
        ? Math.floor(raw.lastNudgedToolCallCount)
        : null,
    lastSeenDeferralKey:
      typeof raw.lastSeenDeferralKey === "string" && raw.lastSeenDeferralKey.trim()
        ? raw.lastSeenDeferralKey.trim()
        : null,
    modeCachedAt: normalizeNullableTimestamp(raw.modeCachedAt),
    modeCacheValue: normalizeMode(raw.modeCacheValue),
  };
}

function normalizeMode(value: unknown): Mode | null {
  return typeof value === "string" && value.trim() ? (value.trim() as Mode) : null;
}

function normalizeNullableTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}
