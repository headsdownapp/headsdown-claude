import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HeadsDownClient } from "@headsdown/sdk";
import { getLowLevelGraphQLClient } from "./sdk-compat.js";

export interface SessionTimeboxExtensionRequestView {
  id?: string | null;
  requestedExtensionMinutes?: number | null;
  requestedAt?: string | null;
}

export interface AgentSessionSummaryView {
  sessionId?: string | null;
  timeboxExpiresAt?: string | null;
  pendingTimeboxExtensionRequest?: SessionTimeboxExtensionRequestView | null;
}

export interface SessionTimeboxPromptState {
  active: boolean;
  sessionId: string | null;
  timeboxExpiresAt: string | null;
  remainingMinutes: number | null;
  thresholdMinutes: number | null;
  fingerprint: string | null;
  choices: ["Request 15 minutes", "Request 30 minutes", "Wrap up"];
}

export interface SessionTimeboxExtensionRequestResult {
  sessionId: string;
  request: {
    id: string;
    requestedExtensionMinutes: number;
    requestedAt: string;
  };
}

const DEFAULT_SESSION_TIMEBOX_THRESHOLD_MINUTES = 15;
const SESSION_TIMEBOX_CHOICES: SessionTimeboxPromptState["choices"] = [
  "Request 15 minutes",
  "Request 30 minutes",
  "Wrap up",
];

const REQUEST_SESSION_TIMEBOX_EXTENSION_MUTATION = `
  mutation RequestSessionTimeboxExtension($input: SessionTimeboxExtensionRequestInput!) {
    requestSessionTimeboxExtension(input: $input) {
      sessionId
      request {
        id
        requestedExtensionMinutes
        requestedAt
      }
    }
  }
`;

export function sessionTimeboxPromptDedupePath(sessionId: string | null | undefined): string {
  const normalized = (sessionId ?? "default").replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(tmpdir(), `headsdown-session-timebox-prompt-${normalized}.state`);
}

export async function readSessionTimeboxPromptFingerprint(
  sessionId: string | null | undefined,
): Promise<string | null> {
  try {
    const value = await readFile(sessionTimeboxPromptDedupePath(sessionId), "utf-8");
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export async function writeSessionTimeboxPromptFingerprint(
  sessionId: string | null | undefined,
  fingerprint: string,
): Promise<void> {
  await writeFile(sessionTimeboxPromptDedupePath(sessionId), fingerprint, { mode: 0o600 });
}

export async function clearSessionTimeboxPromptFingerprint(
  sessionId: string | null | undefined,
): Promise<void> {
  await rm(sessionTimeboxPromptDedupePath(sessionId), { force: true });
}

export function emptySessionTimeboxPromptState(
  thresholdMinutes: number | null = DEFAULT_SESSION_TIMEBOX_THRESHOLD_MINUTES,
): SessionTimeboxPromptState {
  return {
    active: false,
    sessionId: null,
    timeboxExpiresAt: null,
    remainingMinutes: null,
    thresholdMinutes,
    fingerprint: null,
    choices: SESSION_TIMEBOX_CHOICES,
  };
}

export function resolveSessionTimeboxPrompt(input: {
  sessionSummaries?: AgentSessionSummaryView[] | null;
  currentSessionId?: string | null;
  thresholdMinutes?: number | null;
  now?: Date;
}): SessionTimeboxPromptState {
  const thresholdMinutes =
    normalizePositiveInteger(input.thresholdMinutes) ?? DEFAULT_SESSION_TIMEBOX_THRESHOLD_MINUTES;
  const currentSessionId = cleanOpaqueId(input.currentSessionId);
  if (!currentSessionId) return emptySessionTimeboxPromptState(thresholdMinutes);

  const summary = (input.sessionSummaries ?? []).find(
    (item) => cleanOpaqueId(item.sessionId) === currentSessionId,
  );
  const sessionId = cleanOpaqueId(summary?.sessionId);
  const timeboxExpiresAt = cleanIsoTimestamp(summary?.timeboxExpiresAt);
  if (!sessionId || !timeboxExpiresAt || summary?.pendingTimeboxExtensionRequest) {
    return emptySessionTimeboxPromptState(thresholdMinutes);
  }

  const now = input.now ?? new Date();
  const remainingMinutes = minutesUntil(timeboxExpiresAt, now);
  if (remainingMinutes <= 0 || remainingMinutes > thresholdMinutes) {
    return emptySessionTimeboxPromptState(thresholdMinutes);
  }

  return {
    active: true,
    sessionId,
    timeboxExpiresAt,
    remainingMinutes,
    thresholdMinutes,
    fingerprint: `${sessionId}:${timeboxExpiresAt}:${thresholdMinutes}`,
    choices: SESSION_TIMEBOX_CHOICES,
  };
}

export async function requestSessionTimeboxExtensionCompat(
  client: HeadsDownClient,
  sessionId: string,
  requestedExtensionMinutes: number,
): Promise<SessionTimeboxExtensionRequestResult> {
  const nativeMethod = (
    client as unknown as {
      requestSessionTimeboxExtension?: (input: {
        sessionId: string;
        requestedExtensionMinutes: number;
      }) => Promise<SessionTimeboxExtensionRequestResult>;
    }
  ).requestSessionTimeboxExtension;

  if (typeof nativeMethod === "function") {
    return nativeMethod.call(client, { sessionId, requestedExtensionMinutes });
  }

  const graphql = getLowLevelGraphQLClient(client);
  if (!graphql) {
    throw new Error("Session timebox extension requests require @headsdown/sdk 0.11.0 or newer.");
  }

  const response = await graphql.request(REQUEST_SESSION_TIMEBOX_EXTENSION_MUTATION, {
    input: { sessionId, requestedExtensionMinutes },
  });
  const result = response.requestSessionTimeboxExtension as
    | SessionTimeboxExtensionRequestResult
    | null
    | undefined;
  if (!result) throw new Error("HeadsDown API returned no session timebox extension request.");
  return result;
}

function minutesUntil(value: string, now: Date): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.ceil((timestamp - now.getTime()) / 60_000));
}

function cleanIsoTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}

function cleanOpaqueId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePositiveInteger(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
