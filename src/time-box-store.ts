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
    const validationError = validateStoredTimeBoxState(state);
    if (validationError) {
      throw new Error(`Cannot save invalid HeadsDown box: ${validationError}`);
    }
    if (state.sessionIdHash !== this.sessionIdHash) {
      throw new Error("Cannot save HeadsDown box for a different Claude session.");
    }

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  }

  async load(): Promise<TimeBoxState | null> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf-8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw new Error(`Could not read HeadsDown box at ${this.filePath}: ${errorMessage(error)}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid HeadsDown box at ${this.filePath}: ${errorMessage(error)}`);
    }

    const validationError = validateStoredTimeBoxState(parsed);
    if (validationError) {
      throw new Error(`Invalid HeadsDown box at ${this.filePath}: ${validationError}`);
    }
    const state = parsed as TimeBoxState;
    if (state.sessionIdHash !== this.sessionIdHash) return null;
    return state;
  }

  async clear(): Promise<boolean> {
    try {
      await unlink(this.filePath);
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return true;
      throw new Error(`Could not clear HeadsDown box at ${this.filePath}: ${errorMessage(error)}`);
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

function validateStoredTimeBoxState(value: unknown): string | null {
  if (!value || typeof value !== "object") return "state must be an object";

  const candidate = value as Partial<TimeBoxState>;
  if (candidate.schemaVersion !== 1) return "schemaVersion must be 1";
  if (typeof candidate.sessionIdHash !== "string" || candidate.sessionIdHash.trim().length === 0) {
    return "sessionIdHash must be a non-empty string";
  }
  if (
    typeof candidate.durationMinutes !== "number" ||
    !Number.isFinite(candidate.durationMinutes) ||
    !Number.isInteger(candidate.durationMinutes) ||
    candidate.durationMinutes <= 0
  ) {
    return "durationMinutes must be a positive integer";
  }
  if (typeof candidate.createdAt !== "string") return "createdAt must be a timestamp string";
  if (typeof candidate.expiresAt !== "string") return "expiresAt must be a timestamp string";

  const createdAtMs = Date.parse(candidate.createdAt);
  const expiresAtMs = Date.parse(candidate.expiresAt);
  if (Number.isNaN(createdAtMs)) return "createdAt must be a valid timestamp";
  if (Number.isNaN(expiresAtMs)) return "expiresAt must be a valid timestamp";
  if (expiresAtMs < createdAtMs) return "expiresAt must not be before createdAt";
  if (Math.round((expiresAtMs - createdAtMs) / 60_000) !== candidate.durationMinutes) {
    return "expiresAt must match durationMinutes";
  }
  if (candidate.source !== "slash_command") return 'source must be "slash_command"';

  return null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
