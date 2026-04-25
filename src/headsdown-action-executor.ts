import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
export type RunActionContext = {
  sourceState?: string | null;
  allowedActionKeys?: string[] | null;
};

export const CANONICAL_ACTION_KEYS = [
  "continue",
  "continue_with_limit",
  "narrow_scope",
  "ask_user",
  "queue_for_later",
  "queue_for_morning",
  "pause_and_summarize",
  "stop_run",
  "resume_run",
  "allow_once",
  "allow_for_duration",
  "create_temporary_exception",
  "keep_queued",
] as const;

const UNSUPPORTED_CANONICAL_ACTIONS = new Set(["create_temporary_exception"]);
const ACTIONS_REQUIRING_DURATION = new Set(["allow_for_duration"]);
const QUEUED_MARKER_ACTIONS = new Set([
  "queue_for_later",
  "queue_for_morning",
  "pause_and_summarize",
  "keep_queued",
]);

type CanonicalActionKey = (typeof CANONICAL_ACTION_KEYS)[number];

type MarkerHandoffState = "saved" | "missing" | "unknown";

export type ApplyActionInput = {
  runId: string;
  actionKey: string;
  sourceState?: string;
  durationMinutes?: number;
  reason?: string;
  idempotencyKey?: string;
  actionExpiresAt?: string;
  expiresAt?: string;
  overrideExpiresAt?: string;
  mode?: string;
  resumeEligibleAt?: string;
  nextWorkWindowStartsAt?: string;
  handoffAvailable?: boolean;
  handoffState?: MarkerHandoffState;
  handoffSource?: string;
  handoffKind?: string;
  handoffCapturedAt?: string;
};

export type ApplyActionSuccess = {
  ok: true;
  mutationInput: Record<string, unknown>;
  payload: Record<string, unknown>;
};

export type ApplyActionFailureCode =
  | "missing_required_input"
  | "unsupported_action"
  | "not_allowed"
  | "backend_unavailable"
  | "backend_rejected";

export type ApplyActionFailure = {
  ok: false;
  error: {
    code: ApplyActionFailureCode;
    message: string;
    details: Record<string, unknown>;
  };
};

export type ApplyActionResult = ApplyActionSuccess | ApplyActionFailure;

type ApplyActionDeps = {
  getRunActionContext: (runId: string) => Promise<RunActionContext | null>;
  mutateAction: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  markerStore: LocalActionMarkerStore;
  now: () => Date;
};

type StoredRunMarker = {
  runId: string;
  handoffAvailable: boolean;
  handoffState: MarkerHandoffState;
  handoffSource: string;
  handoffKind: string;
  handoffCapturedAt: string;
  resumeEligibleAt?: string;
  nextWorkWindowStartsAt?: string;
  attemptByAction: Record<string, string>;
  updatedAt: string;
};

type MarkerStorePayload = {
  markers: Record<string, StoredRunMarker>;
};

const EMPTY_MARKER_STORE: MarkerStorePayload = { markers: {} };

export class LocalActionMarkerStore {
  constructor(private readonly filePath: string = defaultMarkerPath()) {}

  async get(runId: string): Promise<StoredRunMarker | null> {
    const store = await this.load();
    return store.markers[runId] ?? null;
  }

  async upsert(runId: string, updates: Partial<StoredRunMarker>): Promise<StoredRunMarker> {
    const store = await this.load();
    const existing = store.markers[runId];
    const merged: StoredRunMarker = {
      runId,
      handoffAvailable: updates.handoffAvailable ?? existing?.handoffAvailable ?? false,
      handoffState: updates.handoffState ?? existing?.handoffState ?? "unknown",
      handoffSource: updates.handoffSource ?? existing?.handoffSource ?? "claude",
      handoffKind: updates.handoffKind ?? existing?.handoffKind ?? "checkpoint",
      handoffCapturedAt:
        updates.handoffCapturedAt ?? existing?.handoffCapturedAt ?? new Date().toISOString(),
      resumeEligibleAt: updates.resumeEligibleAt ?? existing?.resumeEligibleAt,
      nextWorkWindowStartsAt: updates.nextWorkWindowStartsAt ?? existing?.nextWorkWindowStartsAt,
      attemptByAction: updates.attemptByAction ?? existing?.attemptByAction ?? {},
      updatedAt: updates.updatedAt ?? new Date().toISOString(),
    };

    store.markers[runId] = merged;
    await this.save(store);
    return merged;
  }

  async clear(runId: string): Promise<void> {
    const store = await this.load();
    if (store.markers[runId]) {
      delete store.markers[runId];
      await this.save(store);
    }
  }

  async listActive(): Promise<StoredRunMarker[]> {
    const store = await this.load();
    return Object.values(store.markers);
  }

  private async load(): Promise<MarkerStorePayload> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as MarkerStorePayload;
      if (!parsed || typeof parsed !== "object" || typeof parsed.markers !== "object") {
        return { ...EMPTY_MARKER_STORE };
      }
      return parsed;
    } catch {
      return { ...EMPTY_MARKER_STORE };
    }
  }

  private async save(payload: MarkerStorePayload): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
  }
}

export async function applyCanonicalAction(
  rawInput: ApplyActionInput,
  deps: ApplyActionDeps,
): Promise<ApplyActionResult> {
  const runId = clean(rawInput.runId);
  if (!runId) {
    return failure("missing_required_input", "run_id is required.", { field: "run_id" });
  }

  const normalizedActionCandidate = normalizeStateKey(rawInput.actionKey);
  if (!normalizedActionCandidate) {
    return failure("missing_required_input", "action_key is required.", { field: "action_key" });
  }

  if (!CANONICAL_ACTION_KEYS.includes(normalizedActionCandidate as CanonicalActionKey)) {
    return failure("unsupported_action", "action_key is not canonical.", {
      actionKey: normalizedActionCandidate,
      canonicalActionKeys: CANONICAL_ACTION_KEYS,
    });
  }

  const normalizedAction = normalizedActionCandidate as CanonicalActionKey;

  if (UNSUPPORTED_CANONICAL_ACTIONS.has(normalizedAction)) {
    return failure(
      "unsupported_action",
      "Canonical action is recognized but not supported by this Claude client yet.",
      {
        actionKey: normalizedAction,
      },
    );
  }

  if (
    ACTIONS_REQUIRING_DURATION.has(normalizedAction) &&
    !isPositiveNumber(rawInput.durationMinutes)
  ) {
    return failure(
      "missing_required_input",
      "duration_minutes is required and must be greater than zero for this action.",
      { field: "duration_minutes", actionKey: normalizedAction },
    );
  }

  const runActionContext = await deps.getRunActionContext(runId);
  const allowedActionKeys = canonicalAllowedActionKeys(runActionContext?.allowedActionKeys ?? null);
  if (allowedActionKeys && !allowedActionKeys.includes(normalizedAction)) {
    return failure("not_allowed", "Action is not allowed for the target HeadsDown run.", {
      actionKey: normalizedAction,
      allowedActionKeys,
      sourceState: runActionContext?.sourceState ?? null,
    });
  }

  const existingMarker = await deps.markerStore.get(runId);
  const mutationInput = buildMutationInput(
    rawInput,
    normalizedAction,
    existingMarker,
    runActionContext,
    deps.now,
  );

  let payload: Record<string, unknown>;
  try {
    payload = await deps.mutateAction(mutationInput);
  } catch (error) {
    return failure("backend_unavailable", "HeadsDown action API could not be reached.", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const actionPayload =
    (payload.applyHeadsdownAction as Record<string, unknown> | undefined) ??
    (payload.applyHeadsDownAction as Record<string, unknown> | undefined);

  if (!actionPayload) {
    return failure("backend_unavailable", "HeadsDown action response was empty.", {});
  }

  const ok = actionPayload.ok === true;
  if (!ok) {
    return failure("backend_rejected", "HeadsDown rejected the action.", {
      action: actionPayload,
    });
  }

  if (isQueuedMarkerAction(normalizedAction)) {
    await applyLocalMarkerSemantics(rawInput, normalizedAction, deps.markerStore, deps.now);
  } else {
    await deps.markerStore.clear(runId);
  }

  return {
    ok: true,
    mutationInput,
    payload: actionPayload,
  };
}

async function applyLocalMarkerSemantics(
  input: ApplyActionInput,
  actionKey: CanonicalActionKey,
  markerStore: LocalActionMarkerStore,
  now: () => Date,
): Promise<StoredRunMarker | null> {
  const runId = clean(input.runId);
  if (!runId) return null;

  if (actionKey === "resume_run") {
    return markerStore.get(runId);
  }

  if (!isQueuedMarkerAction(actionKey)) {
    return markerStore.get(runId);
  }

  const existing = await markerStore.get(runId);
  const handoffKind =
    clean(input.handoffKind) ?? existing?.handoffKind ?? defaultHandoffKind(actionKey);

  const handoffState = input.handoffState ?? existing?.handoffState ?? "unknown";
  const handoffAvailable =
    input.handoffAvailable ?? existing?.handoffAvailable ?? handoffState === "saved";
  const handoffCapturedAt = clean(input.handoffCapturedAt) ?? existing?.handoffCapturedAt;

  const attemptByAction = {
    ...(existing?.attemptByAction ?? {}),
    [actionKey]: existing?.attemptByAction?.[actionKey] ?? stableLocalAttempt(input, actionKey),
  };

  return markerStore.upsert(runId, {
    handoffAvailable,
    handoffState,
    handoffSource: clean(input.handoffSource) ?? existing?.handoffSource ?? "claude",
    handoffKind,
    handoffCapturedAt: handoffCapturedAt ?? now().toISOString(),
    resumeEligibleAt: clean(input.resumeEligibleAt) ?? existing?.resumeEligibleAt,
    nextWorkWindowStartsAt: clean(input.nextWorkWindowStartsAt) ?? existing?.nextWorkWindowStartsAt,
    attemptByAction,
    updatedAt: now().toISOString(),
  });
}

function buildMutationInput(
  input: ApplyActionInput,
  actionKey: CanonicalActionKey,
  marker: StoredRunMarker | null,
  runActionContext: RunActionContext | null,
  now: () => Date,
): Record<string, unknown> {
  const mutationInput: Record<string, unknown> = {
    runId: clean(input.runId),
    actionKey,
    client: "claude-code",
    source: "claude_code_mcp",
  };

  const sourceState = normalizeStateKey(runActionContext?.sourceState);
  if (sourceState) mutationInput.sourceState = sourceState;

  if (typeof input.durationMinutes === "number")
    mutationInput.durationMinutes = input.durationMinutes;
  const reason = clean(input.reason);
  if (reason) mutationInput.reason = reason;

  const suppliedIdempotencyKey = clean(input.idempotencyKey);
  if (suppliedIdempotencyKey) {
    mutationInput.idempotencyKey = suppliedIdempotencyKey;
  } else {
    mutationInput.idempotencyKey = defaultIdempotencyKey(actionKey, input, marker, now);
  }

  copyIfPresent(mutationInput, "actionExpiresAt", clean(input.actionExpiresAt));
  copyIfPresent(mutationInput, "expiresAt", clean(input.expiresAt));
  copyIfPresent(mutationInput, "overrideExpiresAt", clean(input.overrideExpiresAt));
  copyIfPresent(mutationInput, "mode", clean(input.mode));

  const resumeEligibleAt = clean(input.resumeEligibleAt) ?? marker?.resumeEligibleAt;
  const nextWorkWindowStartsAt =
    clean(input.nextWorkWindowStartsAt) ?? marker?.nextWorkWindowStartsAt;

  if (isQueuedMarkerAction(actionKey)) {
    const handoffState = input.handoffState ?? marker?.handoffState ?? "unknown";
    mutationInput.handoffAvailable = input.handoffAvailable ?? marker?.handoffAvailable ?? false;
    mutationInput.handoffState = toGraphQLEnum(handoffState);
    mutationInput.handoffSource = clean(input.handoffSource) ?? marker?.handoffSource ?? "claude";
    mutationInput.handoffKind =
      clean(input.handoffKind) ?? marker?.handoffKind ?? defaultHandoffKind(actionKey);
    const handoffCapturedAt = clean(input.handoffCapturedAt) ?? marker?.handoffCapturedAt;
    if (handoffCapturedAt && handoffState === "saved") {
      mutationInput.handoffCapturedAt = handoffCapturedAt;
    }

    if (resumeEligibleAt) mutationInput.resumeEligibleAt = resumeEligibleAt;
    if (nextWorkWindowStartsAt) mutationInput.nextWorkWindowStartsAt = nextWorkWindowStartsAt;
  }

  return mutationInput;
}

function defaultIdempotencyKey(
  actionKey: CanonicalActionKey,
  input: ApplyActionInput,
  marker: StoredRunMarker | null,
  now: () => Date,
): string {
  const normalizedRunId = clean(input.runId) ?? "unknown-run";

  if (isQueuedMarkerAction(actionKey)) {
    const attempt =
      marker?.attemptByAction?.[actionKey] ??
      marker?.attemptByAction?.queue_for_morning ??
      stableLocalAttempt(input, actionKey);
    return `claude:${normalizedRunId}:${actionKey}:${attempt}`;
  }

  return `claude:${normalizedRunId}:${actionKey}:${now().toISOString()}`;
}

function stableLocalAttempt(input: ApplyActionInput, actionKey: CanonicalActionKey): string {
  const parts = [
    clean(input.runId) ?? "unknown-run",
    actionKey,
    normalizeStateKey(input.sourceState) ?? "unknown-state",
    String(input.durationMinutes ?? "no-duration"),
    clean(input.resumeEligibleAt) ?? "no-resume-at",
    clean(input.nextWorkWindowStartsAt) ?? "no-next-window",
    clean(input.handoffKind) ?? "no-handoff-kind",
    input.handoffState ?? "no-handoff-state",
  ];

  return parts.map((part) => part.replace(/[^A-Za-z0-9_.:-]+/g, "_")).join(":");
}

function defaultHandoffKind(actionKey: CanonicalActionKey): string {
  if (actionKey === "pause_and_summarize") return "pause_summary";
  if (actionKey === "queue_for_later") return "queue_for_later";
  return "queue_for_morning";
}

function isQueuedMarkerAction(actionKey: CanonicalActionKey): boolean {
  return QUEUED_MARKER_ACTIONS.has(actionKey);
}

function canonicalAllowedActionKeys(values: string[] | null): CanonicalActionKey[] | null {
  if (!values) return null;

  return [
    ...new Set(
      values
        .map((value) => normalizeActionKey(value))
        .filter(
          (value): value is CanonicalActionKey =>
            value !== null && CANONICAL_ACTION_KEYS.includes(value),
        ),
    ),
  ];
}

function normalizeActionKey(value: string | null | undefined): CanonicalActionKey | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const normalized = cleaned.toLowerCase().replace(/-/g, "_");
  return CANONICAL_ACTION_KEYS.includes(normalized as CanonicalActionKey)
    ? (normalized as CanonicalActionKey)
    : null;
}

function normalizeStateKey(value: string | null | undefined): string | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  return cleaned.toLowerCase().replace(/-/g, "_");
}

function failure(
  code: ApplyActionFailureCode,
  message: string,
  details: Record<string, unknown>,
): ApplyActionFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function copyIfPresent(target: Record<string, unknown>, key: string, value: string | null): void {
  if (value) target[key] = value;
}

function toGraphQLEnum(value: string): string {
  return value.trim().toUpperCase().replace(/-/g, "_");
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function defaultMarkerPath(): string {
  const override = process.env.HEADSDOWN_ACTION_MARKERS_PATH;
  const cleaned = clean(override);
  if (cleaned) return cleaned;
  return join(homedir(), ".config", "headsdown", "agent-control-markers.json");
}

export const APPLY_HEADSDOWN_ACTION_MUTATION = `
  mutation ApplyHeadsdownAction($input: ApplyHeadsdownActionInput!) {
    applyHeadsdownAction(input: $input) {
      ok
      result {
        eventId
        actionKey
        sourceState
        resultingState
        availabilityOverrideId
        replayed
      }
      error {
        code
        message
        details
      }
      runSummary {
        runId
        callKey
        runState
        actionState
        resumeEligibleAt
        nextWorkWindowStartsAt
        handoffAvailable
        handoffState
        handoffMetadata {
          source
          kind
          capturedAt
        }
      }
      currentCall {
        callKey
        allowedActionKeys
      }
      headsdownCall {
        key
        knownKey
        allowedActionKeys
      }
    }
  }
`;
