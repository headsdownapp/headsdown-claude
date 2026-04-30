import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { TimeBoxState } from "./time-box.js";

export class LocalTimeBoxStore {
  constructor(
    private readonly filePath: string = defaultTimeBoxPath(),
    private readonly sessionIdHash: string = defaultSessionIdHash(),
  ) {}

  get sessionHash(): string {
    return this.sessionIdHash;
  }

  async save(state: TimeBoxState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  }

  async load(): Promise<TimeBoxState | null> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<TimeBoxState>;
      if (!isStoredTimeBoxState(parsed)) return null;
      if (parsed.sessionIdHash !== this.sessionIdHash) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async clear(): Promise<boolean> {
    try {
      await unlink(this.filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export function defaultSessionIdHash(env: NodeJS.ProcessEnv = process.env): string {
  const sessionId = clean(env.CLAUDE_SESSION_ID) ?? "default";
  return hashSessionId(sessionId);
}

export function defaultTimeBoxPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = clean(env.HEADSDOWN_TIME_BOX_PATH);
  if (override) return override;
  return join(homedir(), ".config", "headsdown", `time-box-${defaultSessionIdHash(env)}.json`);
}

export function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 16);
}

function isStoredTimeBoxState(value: Partial<TimeBoxState>): value is TimeBoxState {
  return (
    value.schemaVersion === 1 &&
    typeof value.sessionIdHash === "string" &&
    typeof value.durationMinutes === "number" &&
    Number.isFinite(value.durationMinutes) &&
    value.durationMinutes > 0 &&
    typeof value.createdAt === "string" &&
    !Number.isNaN(Date.parse(value.createdAt)) &&
    typeof value.expiresAt === "string" &&
    !Number.isNaN(Date.parse(value.expiresAt)) &&
    value.source === "slash_command"
  );
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
