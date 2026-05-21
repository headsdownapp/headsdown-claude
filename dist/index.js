#!/usr/bin/env node
var __getOwnPropNames = Object.getOwnPropertyNames;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// node_modules/@headsdown/sdk/dist/errors.js
var HeadsDownError, AuthError, ApiError, NetworkError, ValidationError, HeadsDownActionApplyError, HeadsDownActionInvalidStateError, HeadsDownActionExpiredError, HeadsDownActionFeatureDisabledError, HeadsDownActionAuthError;
var init_errors = __esm({
  "node_modules/@headsdown/sdk/dist/errors.js"() {
    HeadsDownError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "HeadsDownError";
      }
    };
    AuthError = class extends HeadsDownError {
      constructor(message) {
        super(message);
        this.name = "AuthError";
      }
    };
    ApiError = class extends HeadsDownError {
      /** HTTP status code, if available. */
      status;
      /** GraphQL error details, if available. */
      graphqlErrors;
      /** Upstream request id for support/debug correlation, if provided by the API. */
      requestId;
      constructor(message, options) {
        super(message);
        this.name = "ApiError";
        this.status = options?.status;
        this.graphqlErrors = options?.graphqlErrors;
        this.requestId = options?.requestId;
      }
    };
    NetworkError = class extends HeadsDownError {
      /** The underlying error, if available. */
      cause;
      constructor(message, cause) {
        super(message);
        this.name = "NetworkError";
        this.cause = cause;
      }
    };
    ValidationError = class extends HeadsDownError {
      /** The field that failed validation. */
      field;
      constructor(message, field) {
        super(message);
        this.name = "ValidationError";
        this.field = field;
      }
    };
    HeadsDownActionApplyError = class extends HeadsDownError {
      actionKey;
      runId;
      code;
      details;
      constructor(message, options) {
        super(message);
        this.name = "HeadsDownActionApplyError";
        this.actionKey = options?.actionKey;
        this.runId = options?.runId;
        this.code = options?.code;
        this.details = options?.details;
      }
    };
    HeadsDownActionInvalidStateError = class extends HeadsDownActionApplyError {
      constructor(message, options) {
        super(message, options);
        this.name = "HeadsDownActionInvalidStateError";
      }
    };
    HeadsDownActionExpiredError = class extends HeadsDownActionApplyError {
      constructor(message, options) {
        super(message, options);
        this.name = "HeadsDownActionExpiredError";
      }
    };
    HeadsDownActionFeatureDisabledError = class extends HeadsDownActionApplyError {
      constructor(message, options) {
        super(message, options);
        this.name = "HeadsDownActionFeatureDisabledError";
      }
    };
    HeadsDownActionAuthError = class extends HeadsDownActionApplyError {
      constructor(message, options) {
        super(message, options);
        this.name = "HeadsDownActionAuthError";
      }
    };
  }
});

// node_modules/@headsdown/sdk/dist/agent-control-actions.js
function normalizeToken(value) {
  return (value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}
function isAuthMessage(message) {
  const normalized = normalizeToken(message);
  return normalized.includes("unauthorized") || normalized.includes("not_authorized") || normalized.includes("forbidden") || normalized.includes("auth") || normalized.includes("permission");
}
function isInvalidState(code, message) {
  return code.includes("invalid_state") || code.includes("invalid_source_state") || code.includes("invalid_transition") || code.includes("stale_action_state") || code.includes("action_not_allowed") || message.includes("invalid_state") || message.includes("invalid_source_state") || message.includes("invalid_transition") || message.includes("stale_action_state") || message.includes("not_allowed");
}
function isExpired(code, message) {
  return code.includes("expired") || message.includes("expired");
}
function isFeatureDisabled(code, message) {
  return code.includes("feature_disabled") || code.includes("disabled") || code.includes("not_enabled") || message.includes("feature_disabled") || message.includes("disabled");
}
function mapHeadsDownActionError(error, context = {}) {
  if (error instanceof HeadsDownActionApplyError || error instanceof HeadsDownActionInvalidStateError || error instanceof HeadsDownActionExpiredError || error instanceof HeadsDownActionFeatureDisabledError || error instanceof HeadsDownActionAuthError) {
    return error;
  }
  if (error instanceof AuthError) {
    return new HeadsDownActionAuthError(error.message, context);
  }
  if (error instanceof ApiError) {
    const graphqlMessages = error.graphqlErrors?.map((entry) => entry.message).join(" ") ?? "";
    if (error.status === 401 || error.status === 403 || isAuthMessage(graphqlMessages)) {
      return new HeadsDownActionAuthError(error.message, context);
    }
    return new HeadsDownActionApplyError(error.message, context);
  }
  if (error instanceof Error) {
    return new HeadsDownActionApplyError(error.message, context);
  }
  return new HeadsDownActionApplyError(String(error), context);
}
function mapHeadsDownActionPayloadError(payloadError, context = {}) {
  const code = normalizeToken(payloadError.code);
  const message = normalizeToken(payloadError.message);
  const options = {
    ...context,
    code: payloadError.code,
    details: payloadError.details
  };
  if (isAuthMessage(code) || isAuthMessage(message)) {
    return new HeadsDownActionAuthError(payloadError.message, options);
  }
  if (isInvalidState(code, message)) {
    return new HeadsDownActionInvalidStateError(payloadError.message, options);
  }
  if (isExpired(code, message)) {
    return new HeadsDownActionExpiredError(payloadError.message, options);
  }
  if (isFeatureDisabled(code, message)) {
    return new HeadsDownActionFeatureDisabledError(payloadError.message, options);
  }
  return new HeadsDownActionApplyError(payloadError.message, options);
}
function buildActionIdempotencyKey(actionKey, runId) {
  return `${actionKey}-${runId}-${Date.now()}-${randomHex(8)}`;
}
function randomHex(bytes) {
  const array = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(array);
  } else {
    for (let index = 0; index < bytes; index += 1) {
      array[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
var init_agent_control_actions = __esm({
  "node_modules/@headsdown/sdk/dist/agent-control-actions.js"() {
    init_errors();
  }
});

// node_modules/@headsdown/sdk/dist/agent-run-events.js
function buildAgentRunEventInput(input) {
  validateBaseInput(input);
  const eventType = input.eventType;
  const progressPayload2 = eventType === AGENT_RUN_PROGRESS_EVENT_TYPE ? normalizeProgressPayload(input.progressPayload) : void 0;
  const payload = eventType === AGENT_RUN_PROGRESS_EVENT_TYPE ? void 0 : normalizePayload(input.payload);
  const variablesInput = stripUndefined({
    eventId: input.eventId ?? randomUuid(),
    eventType,
    schemaVersion: input.schemaVersion ?? AGENT_RUN_EVENT_SCHEMA_VERSION,
    occurredAt: input.occurredAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    workspaceRef: input.workspaceRef?.trim() || "unknown",
    client: input.client ?? DEFAULT_CLIENT,
    actor: input.actor ?? DEFAULT_ACTOR,
    runId: input.runId,
    source: input.source ?? "sdk",
    privacyMode: input.privacyMode ?? AGENT_RUN_EVENT_PRIVACY_MODE,
    idempotencyKey: input.idempotencyKey ?? buildAgentRunEventIdempotencyKey(input.runId, eventType, input.sequence),
    correlationId: input.correlationId,
    causationEventId: input.causationEventId,
    sequence: input.sequence,
    proposalRef: input.proposalRef,
    payload,
    progressPayload: progressPayload2
  });
  return privacySafeClone(variablesInput, "input", ENVELOPE_TOP_LEVEL_EXEMPT_KEYS);
}
function startedEvent(context, payload) {
  return { ...context, eventType: "agent_run.started", payload };
}
function progressEvent(context, progressPayload2) {
  return { ...context, eventType: AGENT_RUN_PROGRESS_EVENT_TYPE, progressPayload: progressPayload2 };
}
function scopeDriftDetectedEvent(context, payload) {
  return { ...context, eventType: "scope_drift.detected", payload };
}
function continuationSavedEvent(context, payload) {
  return { ...context, eventType: "agent_run.continuation_saved", payload };
}
function queuedForMorningEvent(context, payload) {
  return { ...context, eventType: "agent_run.queued_for_morning", payload };
}
function queuedForLaterEvent(context, payload) {
  return { ...context, eventType: "agent_run.queued_for_later", payload };
}
function resumedEvent(context, payload) {
  return { ...context, eventType: "agent_run.resumed", payload };
}
function completedEvent(context, payload) {
  return { ...context, eventType: "agent_run.completed", payload };
}
function failedEvent(context, payload) {
  return { ...context, eventType: "agent_run.failed", payload };
}
function cancelledEvent(context, payload) {
  return { ...context, eventType: "agent_run.cancelled", payload };
}
function steeringOutcomeReportedEvent(context, payload) {
  return { ...context, eventType: "steering_outcome.reported", payload };
}
function deferredDecisionResolvedEvent(context, payload) {
  return {
    ...context,
    eventType: "deferred_decision.resolved",
    idempotencyKey: `${context.runId}:deferred_decision.resolved:${payload.decision_id}`,
    payload
  };
}
function deferredDecisionReAttemptedEvent(context, payload) {
  return {
    ...context,
    eventType: "deferred_decision.re_attempted",
    idempotencyKey: `${context.runId}:deferred_decision.re_attempted:${payload.decision_id}`,
    payload
  };
}
function buildAgentRunEventIdempotencyKey(runId, eventType, sequence) {
  const suffix = sequence === void 0 ? Date.now().toString(36) : String(sequence);
  return `${safeToken(runId)}:${safeToken(eventType)}:${suffix}`;
}
function bucketFileCount(count) {
  if (count === void 0 || !Number.isFinite(count) || count < 0)
    return "unknown";
  if (count === 0)
    return "0";
  if (count <= 2)
    return "1_to_2";
  if (count <= 5)
    return "3_to_5";
  if (count <= 10)
    return "6_to_10";
  return "over_10";
}
function bucketScopeGrowth(count) {
  if (count === void 0 || !Number.isFinite(count) || count < 0)
    return "unknown";
  if (count === 0)
    return "none";
  if (count <= 2)
    return "1_to_2_files";
  if (count <= 5)
    return "3_to_5_files";
  if (count <= 10)
    return "6_to_10_files";
  return "over_10_files";
}
function assertPrivacySafe(value, path = "input") {
  validatePrivacySafe(value, path);
}
function validatePrivacySafe(value, path, topLevelExemptKeys) {
  if (value === null || value === void 0)
    return;
  if (Array.isArray(value)) {
    assertPlainJsonArray(value, path);
    for (let index = 0; index < value.length; index += 1) {
      validatePrivacySafe(value[index], `${path}[${index}]`);
    }
    return;
  }
  if (typeof value === "object") {
    if (!isPlainRecord(value)) {
      throw new ValidationError("Agent run events can only include plain JSON-compatible metadata objects.", path);
    }
    for (const [key, entry] of plainRecordEntries(value, path)) {
      const exempt = topLevelExemptKeys?.has(key) ?? false;
      if (!exempt && isProhibitedPrivacyKey(key)) {
        throw new ValidationError(`Agent run events cannot include raw-content field '${key}'.`, path);
      }
      validatePrivacySafe(entry, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new ValidationError("Agent run events can only include JSON-compatible metadata values.", path);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new ValidationError("Agent run events can only include finite numeric metadata values.", path);
  }
  if (typeof value === "string" && UNSAFE_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new ValidationError("Agent run events cannot include paths, URLs, logs, secrets, or raw content.", path);
  }
}
function privacySafeClone(value, path, topLevelExemptKeys) {
  if (value === null || value === void 0)
    return value;
  if (Array.isArray(value)) {
    assertPlainJsonArray(value, path);
    const clone = [];
    Object.setPrototypeOf(clone, null);
    for (let index = 0; index < value.length; index += 1) {
      clone[index] = privacySafeClone(value[index], `${path}[${index}]`);
    }
    return clone;
  }
  if (typeof value === "object") {
    if (!isPlainRecord(value)) {
      throw new ValidationError("Agent run events can only include plain JSON-compatible metadata objects.", path);
    }
    const clone = /* @__PURE__ */ Object.create(null);
    for (const [key, entry] of plainRecordEntries(value, path)) {
      const exempt = topLevelExemptKeys?.has(key) ?? false;
      if (!exempt && isProhibitedPrivacyKey(key)) {
        throw new ValidationError(`Agent run events cannot include raw-content field '${key}'.`, path);
      }
      clone[key] = privacySafeClone(entry, `${path}.${key}`);
    }
    return clone;
  }
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new ValidationError("Agent run events can only include JSON-compatible metadata values.", path);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new ValidationError("Agent run events can only include finite numeric metadata values.", path);
  }
  if (typeof value === "string" && UNSAFE_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new ValidationError("Agent run events cannot include paths, URLs, logs, secrets, or raw content.", path);
  }
  return value;
}
function isProhibitedPrivacyKey(key) {
  const normalizedKey = normalizePrivacyKey(key);
  const compactKey = normalizedKey.replace(/_/g, "");
  return PROHIBITED_KEYS.has(normalizedKey) || PROHIBITED_COMPACT_KEYS.has(compactKey) || normalizedKey.split("_").some((token) => PROHIBITED_KEY_TOKENS.has(token));
}
function normalizePrivacyKey(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function plainRecordEntries(value, path) {
  assertNoJsonSerializer(value, path);
  const entries = [];
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") {
      throw new ValidationError("Agent run events can only include string-keyed metadata fields.", path);
    }
    const descriptor = descriptors[key];
    assertJsonDataProperty(key, descriptor, path);
    entries.push([key, descriptor.value]);
  }
  return entries;
}
function assertPlainJsonArray(value, path) {
  assertNoJsonSerializer(value, path);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(descriptors, String(index))) {
      throw new ValidationError("Agent run events can only include dense JSON-compatible metadata arrays.", path);
    }
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length")
      continue;
    if (typeof key !== "string" || !isArrayIndexKey(key)) {
      throw new ValidationError("Agent run events can only include plain JSON-compatible metadata arrays.", path);
    }
    assertJsonDataProperty(key, descriptors[key], path);
  }
}
function assertJsonDataProperty(key, descriptor, path) {
  if (!descriptor || key === "toJSON" || !descriptor.enumerable || !("value" in descriptor)) {
    throw new ValidationError("Agent run events can only include plain JSON-compatible metadata properties.", path);
  }
}
function assertNoJsonSerializer(value, path) {
  if ("toJSON" in value) {
    throw new ValidationError("Agent run events cannot include custom JSON serialization hooks.", path);
  }
}
function isArrayIndexKey(key) {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1 && String(index) === key;
}
function isPlainRecord(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function validateBaseInput(input) {
  if (!input.eventType?.trim())
    throw new ValidationError("eventType is required.", "eventType");
  if (!input.runId?.trim())
    throw new ValidationError("runId is required.", "runId");
  if (input.privacyMode && input.privacyMode !== AGENT_RUN_EVENT_PRIVACY_MODE) {
    throw new ValidationError("Only metadata_only agent run event reporting is supported.", "privacyMode");
  }
  if (input.schemaVersion !== void 0 && input.schemaVersion !== AGENT_RUN_EVENT_SCHEMA_VERSION) {
    throw new ValidationError("Unsupported agent run event schema version.", "schemaVersion");
  }
  if (input.sequence !== void 0 && (!Number.isInteger(input.sequence) || input.sequence < 0)) {
    throw new ValidationError("sequence must be a non-negative integer.", "sequence");
  }
}
function normalizePayload(payload) {
  if (!payload || !isPlainRecord(payload) || Object.keys(payload).length === 0) {
    throw new ValidationError("payload is required for this agent run event.", "payload");
  }
  return privacySafeClone(payload, "payload");
}
function normalizeProgressPayload(payload) {
  if (!payload) {
    throw new ValidationError("progressPayload is required for agent_run.progress_reported.", "progressPayload");
  }
  const normalized = privacySafeClone(payload, "progressPayload");
  for (const [field, value] of Object.entries(normalized)) {
    if (typeof value === "number" && (!Number.isInteger(value) || value < 0)) {
      throw new ValidationError(`${field} must be a non-negative integer.`, field);
    }
  }
  return normalized;
}
function randomUuid() {
  return globalThis.crypto?.randomUUID?.() ?? fallbackUuid();
}
function fallbackUuid() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) => (Number(char) ^ Math.random() * 16 >> Number(char) / 4).toString(16));
}
function safeToken(value) {
  return value.toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_").slice(0, 96);
}
function stripUndefined(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== void 0));
}
var AGENT_RUN_EVENT_SCHEMA_VERSION, AGENT_RUN_EVENT_PRIVACY_MODE, AGENT_RUN_PROGRESS_EVENT_TYPE, DEFAULT_CLIENT, DEFAULT_ACTOR, PROHIBITED_KEYS, PROHIBITED_COMPACT_KEYS, PROHIBITED_KEY_TOKENS, UNSAFE_VALUE_PATTERNS, ENVELOPE_TOP_LEVEL_EXEMPT_KEYS;
var init_agent_run_events = __esm({
  "node_modules/@headsdown/sdk/dist/agent-run-events.js"() {
    init_errors();
    AGENT_RUN_EVENT_SCHEMA_VERSION = 1;
    AGENT_RUN_EVENT_PRIVACY_MODE = "metadata_only";
    AGENT_RUN_PROGRESS_EVENT_TYPE = "agent_run.progress_reported";
    DEFAULT_CLIENT = {
      kind: "sdk",
      name: "SDK",
      version: "unknown"
    };
    DEFAULT_ACTOR = {
      kind: "agent",
      ref: "sdk"
    };
    PROHIBITED_KEYS = /* @__PURE__ */ new Set([
      "prompt",
      "prompts",
      "model_response",
      "model_responses",
      "transcript",
      "transcripts",
      "message",
      "messages",
      "content",
      "body",
      "text",
      "description",
      "code",
      "diff",
      "patch",
      "snippet",
      "source",
      "file",
      "files",
      "file_contents",
      "file_path",
      "file_paths",
      "path",
      "paths",
      "repo",
      "repo_name",
      "repository",
      "repository_name",
      "git_repo",
      "git_repository",
      "branch",
      "branch_name",
      "git_branch",
      "directory",
      "directory_name",
      "terminal_output",
      "stdout",
      "stderr",
      "log",
      "logs",
      "build_log",
      "build_logs",
      "test_log",
      "output",
      "stacktrace",
      "traceback",
      "url",
      "remote_url",
      "commit_message",
      "pr_body",
      "issue_body",
      "ticket_body",
      "ticket_description",
      "calendar_title",
      "calendar_description",
      "calendar_location",
      "attendee",
      "attendees",
      "location",
      "locations",
      "meeting_link",
      "meeting_links",
      "slack_message",
      "email_body",
      "chat_message",
      "notification_body",
      "dm_content",
      "screenshot",
      "screen_recording",
      "secret",
      "secrets",
      "token",
      "tokens",
      "access_token",
      "access_tokens",
      "refresh_token",
      "refresh_tokens",
      "api_key",
      "api_keys",
      "password",
      "cookie",
      "environment",
      "environment_variable",
      "environment_variables",
      "env_var",
      "env_vars"
    ]);
    PROHIBITED_COMPACT_KEYS = new Set(Array.from(PROHIBITED_KEYS, (key) => key.replace(/_/g, "")));
    PROHIBITED_KEY_TOKENS = /* @__PURE__ */ new Set([
      "body",
      "code",
      "content",
      "contents",
      "cookie",
      "description",
      "diff",
      "log",
      "logs",
      "output",
      "password",
      "patch",
      "prompt",
      "prompts",
      "secret",
      "secrets",
      "snippet",
      "stderr",
      "stdout",
      "stacktrace",
      "text",
      "token",
      "tokens",
      "traceback"
    ]);
    UNSAFE_VALUE_PATTERNS = [
      /(?:^|\s)(?:[./~]|[A-Za-z]:\\)[^\s]+/,
      /^[^\s]+\/[^\s]+$/,
      /\b(?:https?|git|ssh):\/\//i,
      /\b(?:stdout|stderr|stacktrace|traceback|diff --git)\b/i,
      /\b(?:secret|api[_-]?key|token|password)\b/i
    ];
    ENVELOPE_TOP_LEVEL_EXEMPT_KEYS = /* @__PURE__ */ new Set(["source"]);
  }
});

// node_modules/@headsdown/sdk/dist/auth.js
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
function sleep(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
var DEFAULT_BASE_URL, DEFAULT_CREDENTIALS_DIR, DEFAULT_CREDENTIALS_PATH, DEVICE_GRANT_TYPE, CredentialStore, DeviceFlow;
var init_auth = __esm({
  "node_modules/@headsdown/sdk/dist/auth.js"() {
    init_errors();
    DEFAULT_BASE_URL = "https://headsdown.app";
    DEFAULT_CREDENTIALS_DIR = join(homedir(), ".config", "headsdown");
    DEFAULT_CREDENTIALS_PATH = join(DEFAULT_CREDENTIALS_DIR, "credentials.json");
    DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
    CredentialStore = class {
      path;
      constructor(options) {
        this.path = options?.path ?? DEFAULT_CREDENTIALS_PATH;
      }
      /** Load saved credentials. Returns null if no credentials exist or the file is invalid. */
      async load() {
        try {
          const raw = await readFile(this.path, "utf-8");
          const parsed = JSON.parse(raw);
          if (!parsed.apiKey || typeof parsed.apiKey !== "string")
            return null;
          if (!parsed.apiKey.startsWith("hd_"))
            return null;
          return {
            apiKey: parsed.apiKey,
            createdAt: parsed.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
            label: parsed.label
          };
        } catch {
          return null;
        }
      }
      /** Save credentials to disk. Creates parent directories if needed. */
      async save(apiKey, label) {
        const dir = join(this.path, "..");
        await mkdir(dir, { recursive: true });
        const credentials = {
          apiKey,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          label
        };
        await writeFile(this.path, JSON.stringify(credentials, null, 2) + "\n", { mode: 384 });
      }
      /** Delete saved credentials. */
      async clear() {
        try {
          await unlink(this.path);
        } catch {
        }
      }
      /** Return the credentials file path. */
      get filePath() {
        return this.path;
      }
    };
    DeviceFlow = class {
      baseUrl;
      fetchFn;
      constructor(options) {
        this.baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
        this.fetchFn = options?.fetch ?? globalThis.fetch;
      }
      /**
       * Initiate Device Flow authorization.
       * Returns device/user codes and the verification URL.
       */
      async start(label) {
        const body = { client_id: "headsdown-sdk" };
        if (label)
          body.label = label;
        let response;
        try {
          response = await this.fetchFn(`${this.baseUrl}/oauth/device`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
        } catch (error) {
          const cause = error instanceof Error ? error : void 0;
          throw new NetworkError(`Failed to connect to HeadsDown at ${this.baseUrl}: ${cause?.message ?? String(error)}`, cause);
        }
        if (!response.ok) {
          const body2 = await response.text().catch(() => "");
          throw new AuthError(`Device flow initiation failed (${response.status}): ${body2}`);
        }
        const data = await response.json();
        return {
          deviceCode: data.device_code,
          userCode: data.user_code,
          verificationUri: data.verification_uri,
          verificationUriComplete: data.verification_uri_complete,
          expiresIn: data.expires_in,
          interval: data.interval
        };
      }
      /**
       * Poll for authorization approval. Blocks until the user approves, denies,
       * or the code expires. Returns the raw API key on success.
       *
       * @param deviceCode - The device_code from `start()`.
       * @param interval - Polling interval in seconds from `start()`.
       * @param expiresIn - Expiry time in seconds from `start()`.
       * @param signal - Optional AbortSignal to cancel polling early.
       */
      async poll(deviceCode, interval, expiresIn, signal) {
        const deadline = Date.now() + expiresIn * 1e3;
        let pollMs = interval * 1e3;
        while (Date.now() < deadline) {
          if (signal?.aborted) {
            throw new AuthError("Authentication cancelled.");
          }
          await sleep(pollMs);
          if (signal?.aborted) {
            throw new AuthError("Authentication cancelled.");
          }
          let response;
          try {
            response = await this.fetchFn(`${this.baseUrl}/oauth/token`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                grant_type: DEVICE_GRANT_TYPE,
                device_code: deviceCode
              }),
              signal
            });
          } catch (error2) {
            if (error2 instanceof DOMException && error2.name === "AbortError") {
              throw new AuthError("Authentication cancelled.");
            }
            continue;
          }
          if (response.ok) {
            const data = await response.json();
            return data.access_token;
          }
          const error = await response.json();
          switch (error.error) {
            case "authorization_pending":
              break;
            // Keep polling.
            case "slow_down":
              pollMs += 5e3;
              break;
            case "access_denied":
              throw new AuthError("Authorization denied by the user.");
            case "expired_token":
              throw new AuthError("Device code expired. Start authentication again.");
            default:
              throw new AuthError(`Authentication failed: ${error.error_description ?? error.error}`);
          }
        }
        throw new AuthError("Authentication timed out. The device code expired.");
      }
    };
  }
});

// node_modules/@headsdown/sdk/dist/graphql.js
function isRetryableStatus(status2) {
  return status2 === 408 || status2 === 429 || status2 === 502 || status2 === 503 || status2 === 504;
}
function retryDelayFromResponse(response, fallbackMs) {
  const retryAfter = response.headers?.get?.("retry-after");
  if (!retryAfter)
    return fallbackMs;
  const asSeconds = Number(retryAfter);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.round(asSeconds * 1e3);
  }
  const retryAt = Date.parse(retryAfter);
  if (!Number.isNaN(retryAt)) {
    return Math.max(0, retryAt - Date.now());
  }
  return fallbackMs;
}
function sleep2(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
function buildHeaders(apiKey, actorContext) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
  if (actorContext) {
    headers["x-headsdown-actor-context"] = JSON.stringify(actorContext);
  }
  return headers;
}
function normalizeEnums(data, parentKey) {
  if (data === null || data === void 0)
    return data;
  if (Array.isArray(data))
    return data.map((item) => normalizeEnums(item, parentKey));
  if (typeof data !== "object")
    return data;
  const result2 = {};
  for (const [key, value] of Object.entries(data)) {
    if (isEnumField(key, parentKey) && typeof value === "string") {
      result2[key] = normalizeEnumValue(value);
    } else if (isEnumField(key, parentKey) && Array.isArray(value)) {
      result2[key] = value.map((item) => typeof item === "string" ? normalizeEnumValue(item) : item);
    } else if (typeof value === "object" && value !== null) {
      result2[key] = normalizeEnums(value, key);
    } else {
      result2[key] = value;
    }
  }
  return result2;
}
function isEnumField(key, parentKey) {
  if (key === "source")
    return parentKey === "wrapUpGuidance";
  if (key === "actionKey")
    return parentKey === "result";
  return ENUM_FIELDS.has(key);
}
function normalizeEnumValue(value) {
  return /^[A-Z0-9_]+$/.test(value) ? value.toLowerCase() : value;
}
function toGraphQLEnum(value) {
  return value.toUpperCase();
}
var DEFAULT_BASE_URL2, DEFAULT_TIMEOUT, GraphQLClient, ENUM_FIELDS;
var init_graphql = __esm({
  "node_modules/@headsdown/sdk/dist/graphql.js"() {
    init_errors();
    DEFAULT_BASE_URL2 = "https://headsdown.app";
    DEFAULT_TIMEOUT = 3e4;
    GraphQLClient = class {
      apiKey;
      baseUrl;
      fetchFn;
      timeout;
      retries;
      retryDelayMs;
      actorContext;
      hooks;
      constructor(options) {
        this.apiKey = options.apiKey;
        this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL2).replace(/\/+$/, "");
        this.fetchFn = options.fetch ?? globalThis.fetch;
        this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
        this.retries = options.retries ?? 2;
        this.retryDelayMs = options.retryDelayMs ?? 250;
        this.actorContext = options.actorContext;
        this.hooks = options.hooks ?? {};
      }
      /** Execute a GraphQL query or mutation. Returns the `data` payload with enums lowercased. */
      async request(query, variables) {
        const url = `${this.baseUrl}/graphql`;
        for (let attempt = 0; attempt <= this.retries; attempt++) {
          this.hooks.onRequest?.({ url, attempt, query, variables });
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.timeout);
          let response;
          try {
            response = await this.fetchFn(url, {
              method: "POST",
              headers: buildHeaders(this.apiKey, this.actorContext),
              body: JSON.stringify({ query, variables }),
              signal: controller.signal
            });
          } catch (error) {
            const networkError = error instanceof DOMException && error.name === "AbortError" ? new NetworkError(`Request timed out after ${this.timeout}ms`) : new NetworkError(`Failed to connect to HeadsDown API at ${this.baseUrl}: ${error?.message ?? String(error)}`, error instanceof Error ? error : void 0);
            if (attempt < this.retries) {
              const delayMs = this.retryDelayMs * Math.pow(2, attempt);
              this.hooks.onRetry?.({ url, attempt, delayMs, reason: networkError.message });
              await sleep2(delayMs);
              continue;
            }
            throw networkError;
          } finally {
            clearTimeout(timer);
          }
          const requestId = response.headers?.get?.("x-request-id") ?? void 0;
          this.hooks.onResponse?.({
            url,
            attempt,
            status: response.status,
            ok: response.ok,
            requestId
          });
          if (response.status === 401) {
            throw new AuthError("API key is invalid or expired. Authenticate again with DeviceFlow or provide a valid key.");
          }
          if (!response.ok) {
            const body = await response.text().catch(() => "");
            const message = `HeadsDown API returned ${response.status}: ${body}`;
            if (attempt < this.retries && isRetryableStatus(response.status)) {
              const delayMs = retryDelayFromResponse(response, this.retryDelayMs * Math.pow(2, attempt));
              this.hooks.onRetry?.({ url, attempt, delayMs, reason: message });
              await sleep2(delayMs);
              continue;
            }
            throw new ApiError(message, { status: response.status, requestId });
          }
          let json;
          try {
            json = await response.json();
          } catch {
            throw new ApiError("HeadsDown API returned invalid JSON.", { requestId });
          }
          if (json.errors?.length) {
            const messages = json.errors.map((e) => e.message).join("; ");
            throw new ApiError(`GraphQL error: ${messages}`, {
              graphqlErrors: json.errors,
              requestId
            });
          }
          if (!json.data) {
            throw new ApiError("HeadsDown API returned an empty response.", { requestId });
          }
          return normalizeEnums(json.data);
        }
        throw new ApiError("Unexpected request loop termination.");
      }
    };
    ENUM_FIELDS = /* @__PURE__ */ new Set([
      "mode",
      "decision",
      "verdict",
      "originalVerdict",
      "overrideVerdict",
      "day",
      "nextWorkday",
      "outcome",
      "confidenceLevel",
      "policyStatus",
      "visibilityLevel",
      "alertsPolicy",
      "scope",
      "permissions",
      "profile",
      "source",
      "selectedMode",
      "defaultWrapUpMode",
      "deliveryMode",
      // Agent-control action mutation enum-backed fields.
      "actionKey",
      "sourceState",
      "resultingState",
      // Agent-control enum-backed fields.
      "callKey",
      "knownKey",
      "primaryActionKnownKey",
      "primaryActionIntent",
      "secondaryActionKnownKey",
      "secondaryActionIntent",
      "recommendedActionKey",
      "recommendedActionKnownKey",
      "allowedActionKeys",
      "allowedActionKnownKeys",
      "allowedUiIntents",
      "severity",
      "urgency",
      "confidence",
      "evidenceSource",
      "privacyMode",
      "dataState",
      "itemState",
      "runState",
      "actionState",
      "deadlineState",
      "budgetState",
      "nextActionIntent",
      "detailsState",
      "progressState",
      "metricKey",
      "needsYourYesState",
      "runSummariesState",
      "valueMetricsState"
    ]);
  }
});

// node_modules/@headsdown/sdk/dist/queries.js
var ACTIVE_CONTRACT_QUERY, SCHEDULE_QUERY, ACTIVE_AVAILABILITY_OVERRIDE_QUERY, CREATE_AVAILABILITY_OVERRIDE_MUTATION, CANCEL_AVAILABILITY_OVERRIDE_MUTATION, AGENT_CONTROL_OVERVIEW_QUERY, INTERVENTION_REPLAY_QUERY, REPORT_AGENT_RUN_EVENT_MUTATION, LIST_AGENT_RUN_EVENTS_QUERY, APPLY_HEADSDOWN_ACTION_MUTATION, AVAILABILITY_QUERY, SUBMIT_PROPOSAL_MUTATION, LIST_PROPOSALS_QUERY, LIST_PRESETS_QUERY, APPLY_PRESET_MUTATION, CREATE_CONTRACT_MUTATION, PROFILE_QUERY, REQUEST_SESSION_TIMEBOX_EXTENSION_MUTATION, OVERRIDE_VERDICT_MUTATION, CREATE_DELEGATION_GRANT_MUTATION, LIST_DELEGATION_GRANTS_QUERY, ACTIVE_DELEGATION_GRANTS_QUERY, REVOKE_DELEGATION_GRANT_MUTATION, REVOKE_DELEGATION_GRANTS_MUTATION, EVALUATE_INTERRUPT_QUERY, CALIBRATION_PROFILES_QUERY, VERDICT_SETTINGS_QUERY, UPDATE_VERDICT_SETTINGS_MUTATION, DIGEST_SUMMARIES_QUERY, DISMISS_DIGEST_ENTRY_MUTATION, AUTO_RESPONDER_SETTINGS_QUERY, UPDATE_AUTO_RESPONDER_SETTINGS_MUTATION, TEAMS_QUERY, COMPANY_QUERY, TEAM_PRESENCE_QUERY, REPORT_OUTCOME_MUTATION, AUTOPILOT_POLICY_QUERY;
var init_queries = __esm({
  "node_modules/@headsdown/sdk/dist/queries.js"() {
    ACTIVE_CONTRACT_QUERY = `
  query ActiveContract {
    activeContract {
      id
      mode
      status
      statusEmoji
      statusText
      autoRespond
      lock
      duration
      ruleSetType
      ruleSetParams
      expiresAt
      insertedAt
    }
  }
`;
    SCHEDULE_QUERY = `
  query Schedule($at: DateTime) {
    schedule: availability(at: $at) {
      inReachableHours
      nextTransitionAt
      attentionDeadlineAt
      wrapUpGuidance {
        active
        deadlineAt
        remainingMinutes
        profile
        source
        reason
        hints
        thresholdMinutes
        selectedMode
      }
      activeWindow {
        id
        label
        priority
        startTime
        endTime
        days
        mode
        alertsPolicy
        snooze
        status
        statusEmoji
        statusText
        autoActivate
      }
      nextWindow {
        id
        label
        priority
        startTime
        endTime
        days
        mode
        alertsPolicy
        snooze
        status
        statusEmoji
        statusText
        autoActivate
      }
    }
  }
`;
    ACTIVE_AVAILABILITY_OVERRIDE_QUERY = `
  query ActiveAvailabilityOverride {
    activeAvailabilityOverride {
      id
      mode
      reason
      source
      expiresAt
      cancelledAt
      expiredAt
      createdById
      cancelledById
      insertedAt
      updatedAt
    }
  }
`;
    CREATE_AVAILABILITY_OVERRIDE_MUTATION = `
  mutation CreateAvailabilityOverride($input: AvailabilityOverrideInput!) {
    createAvailabilityOverride(input: $input) {
      id
      mode
      reason
      source
      expiresAt
      cancelledAt
      expiredAt
      createdById
      cancelledById
      insertedAt
      updatedAt
    }
  }
`;
    CANCEL_AVAILABILITY_OVERRIDE_MUTATION = `
  mutation CancelAvailabilityOverride($id: ID!, $reason: String, $source: String) {
    cancelAvailabilityOverride(id: $id, reason: $reason, source: $source) {
      id
      mode
      reason
      source
      expiresAt
      cancelledAt
      expiredAt
      createdById
      cancelledById
      insertedAt
      updatedAt
    }
  }
`;
    AGENT_CONTROL_OVERVIEW_QUERY = `
  query AgentControlOverview {
    agentControlOverview {
      currentCall {
        callKey
        title
        body
        primaryActionLabel
        primaryActionIntent
        secondaryActionLabel
        secondaryActionIntent
        recommendedActionKey
        allowedActionKeys
        reasonCodes
        dataState
        evaluatedAt
      }
      headsdownCall {
        key
        knownKey
        title
        body
        severity
        urgency
        primaryActionLabel
        primaryActionKey
        primaryActionKnownKey
        primaryActionIntent
        secondaryActionLabel
        secondaryActionKey
        secondaryActionKnownKey
        secondaryActionIntent
        recommendedActionKey
        recommendedActionKnownKey
        allowedActionKeys
        allowedActionKnownKeys
        allowedUiIntents
        reasonCodes
        confidence
        evidenceSource
        privacyMode
        expiresAt
      }
      needsYourYes {
        runId
        proposalId
        actionTargetId
        callKey
        title
        body
        itemState
        primaryActionLabel
        primaryActionIntent
        recommendedActionKey
        allowedActionKeys
        reasonCodes
        dataState
        createdAt
        updatedAt
      }
      needsYourYesState
      runSummaries {
        runId
        proposalId
        actionTargetId
        callKey
        runState
        actionState
        clientLabel
        safeTitle
        recommendedActionKey
        allowedActionKeys
        reasonCodes
        elapsedSeconds
        deadlineState
        budgetState
        nextActionLabel
        nextActionIntent
        dataState
        detailsState
        progressState
        insertedAt
        updatedAt
      }
      runSummariesState
      valueMetrics {
        metricKey
        label
        value
        unit
        confidence
        evidenceCount
        explanation
        dataState
      }
      valueMetricsState
      generatedAt
    }
  }
`;
    INTERVENTION_REPLAY_QUERY = `
  query InterventionReplay($proposalId: ID!) {
    interventionReplay(proposalId: $proposalId) {
      runId
      proposalId
      actionTargetId
      callKey
      title
      whatWasAboutToHappen
      whatHeadsdownSaw {
        key
        label
        value
      }
      headsdownCall
      thePlay
      result
      nextTime
      reasonCodes
      recommendedActionKey
      valueEvidence
      dataState
      updatedAt
    }
  }
`;
    REPORT_AGENT_RUN_EVENT_MUTATION = `
  mutation ReportAgentRunEvent($input: ReportAgentRunEventInput!) {
    reportAgentRunEvent(input: $input) {
      ok
      error {
        code
        message
        details
      }
      event {
        id
        eventId
        eventType
        schemaVersion
        occurredAt
        receivedAt
        workspaceRef
        client {
          kind
          name
          version
        }
        actor {
          kind
          ref
        }
        runId
        source
        privacyMode
        idempotencyKey
        correlationId
        causationEventId
        sequence
        emitterKey
        proposalRef
        payload
        insertedAt
      }
    }
  }
`;
    LIST_AGENT_RUN_EVENTS_QUERY = `
  query AgentRunEvents(
    $runId: ID
    $eventType: String
    $resolutionKind: DeferredDecisionResolutionKind
    $flaggedForReview: Boolean
    $insertedAfter: DateTime
    $insertedBefore: DateTime
    $limit: Int
  ) {
    agentRunEvents(
      runId: $runId
      eventType: $eventType
      resolutionKind: $resolutionKind
      flaggedForReview: $flaggedForReview
      insertedAfter: $insertedAfter
      insertedBefore: $insertedBefore
      limit: $limit
    ) {
      id
      eventId
      eventType
      schemaVersion
      occurredAt
      receivedAt
      workspaceRef
      client {
        kind
        name
        version
      }
      actor {
        kind
        ref
      }
      runId
      source
      privacyMode
      idempotencyKey
      correlationId
      causationEventId
      sequence
      emitterKey
      proposalRef
      payload
      insertedAt
    }
  }
`;
    APPLY_HEADSDOWN_ACTION_MUTATION = `
  mutation ApplyHeadsdownAction($input: ApplyHeadsdownActionInput!) {
    applyHeadsdownAction(input: $input) {
      ok
      error {
        code
        message
        details
      }
      result {
        actionKey
        replayed
        sourceState
        resultingState
        eventId
        availabilityOverrideId
      }
      currentCall {
        callKey
        title
        body
        primaryActionLabel
        primaryActionIntent
        secondaryActionLabel
        secondaryActionIntent
        recommendedActionKey
        allowedActionKeys
        reasonCodes
        dataState
        evaluatedAt
      }
      headsdownCall {
        key
        knownKey
        title
        body
        severity
        urgency
        primaryActionLabel
        primaryActionKey
        primaryActionKnownKey
        primaryActionIntent
        secondaryActionLabel
        secondaryActionKey
        secondaryActionKnownKey
        secondaryActionIntent
        recommendedActionKey
        recommendedActionKnownKey
        allowedActionKeys
        allowedActionKnownKeys
        allowedUiIntents
        reasonCodes
        confidence
        evidenceSource
        privacyMode
        expiresAt
      }
      runSummary {
        runId
        proposalId
        actionTargetId
        callKey
        runState
        actionState
        clientLabel
        safeTitle
        recommendedActionKey
        allowedActionKeys
        reasonCodes
        elapsedSeconds
        deadlineState
        budgetState
        nextActionLabel
        nextActionIntent
        dataState
        detailsState
        progressState
        insertedAt
        updatedAt
      }
    }
  }
`;
    AVAILABILITY_QUERY = `
  query Availability($at: DateTime) {
    activeContract {
      id
      mode
      status
      statusEmoji
      statusText
      autoRespond
      lock
      duration
      ruleSetType
      ruleSetParams
      expiresAt
      insertedAt
    }
    schedule: availability(at: $at) {
      inReachableHours
      nextTransitionAt
      attentionDeadlineAt
      wrapUpGuidance {
        active
        deadlineAt
        remainingMinutes
        profile
        source
        reason
        hints
        thresholdMinutes
        selectedMode
      }
      activeWindow {
        id
        label
        priority
        startTime
        endTime
        days
        mode
        alertsPolicy
        snooze
        status
        statusEmoji
        statusText
        autoActivate
      }
      nextWindow {
        id
        label
        priority
        startTime
        endTime
        days
        mode
        alertsPolicy
        snooze
        status
        statusEmoji
        statusText
        autoActivate
      }
    }
  }
`;
    SUBMIT_PROPOSAL_MUTATION = `
  mutation SubmitProposal($input: ProposalInput!) {
    submitProposal(input: $input) {
      decision
      reason
      proposalId
      evaluatedAt
      wrapUpGuidance {
        active
        deadlineAt
        remainingMinutes
        profile
        source
        reason
        hints
        thresholdMinutes
        selectedMode
      }
    }
  }
`;
    LIST_PROPOSALS_QUERY = `
  query Proposals($verdict: VerdictDecision, $latest: Int) {
    proposals(verdict: $verdict, latest: $latest) {
      id
      agentRef
      model
      framework
      description
      estimatedFiles
      estimatedMinutes
      scopeSummary
      sourceRef
      deliveryMode
      verdict
      verdictReason
      wrapUpGuidance {
        active
        deadlineAt
        remainingMinutes
        profile
        source
        reason
        hints
        thresholdMinutes
        selectedMode
      }
      insertedAt
    }
  }
`;
    LIST_PRESETS_QUERY = `
  query Presets {
    presets {
      id
      name
      status
      statusEmoji
      statusText
      duration
      insertedAt
      updatedAt
    }
  }
`;
    APPLY_PRESET_MUTATION = `
  mutation ApplyPreset($id: ID!) {
    applyPreset(id: $id) {
      id
      mode
      status
      statusEmoji
      statusText
      autoRespond
      lock
      duration
      ruleSetType
      ruleSetParams
      expiresAt
      insertedAt
    }
  }
`;
    CREATE_CONTRACT_MUTATION = `
  mutation CreateContract($input: ContractInput!) {
    createContract(input: $input) {
      id
      mode
      status
      statusEmoji
      statusText
      autoRespond
      lock
      duration
      ruleSetType
      ruleSetParams
      expiresAt
      insertedAt
    }
  }
`;
    PROFILE_QUERY = `
  query Profile {
    profile {
      id
      name
      handle
      email
      avatar
      timezone
      visibilityLevel
      showStatusMessage
      confirmedAt
      location
      insertedAt
      updatedAt
    }
  }
`;
    REQUEST_SESSION_TIMEBOX_EXTENSION_MUTATION = `
  mutation RequestSessionTimeboxExtension($sessionId: String!, $requestedExtensionMinutes: Int!) {
    requestSessionTimeboxExtension(
      sessionId: $sessionId
      requestedExtensionMinutes: $requestedExtensionMinutes
    ) {
      sessionId
      pendingTimeboxExtensionRequest {
        id
        requestedExtensionMinutes
        requestedAt
      }
    }
  }
`;
    OVERRIDE_VERDICT_MUTATION = `
  mutation OverrideVerdict($input: OverrideInput!) {
    overrideVerdict(input: $input) {
      id
      originalVerdict
      overrideVerdict
      reason
      proposalId
      insertedAt
    }
  }
`;
    CREATE_DELEGATION_GRANT_MUTATION = `
  mutation CreateDelegationGrant($input: DelegationGrantInput!) {
    createDelegationGrant(input: $input) {
      id
      scope
      sessionId
      workspaceRef
      agentId
      permissions
      source
      expiresAt
      revokedAt
      expiredAt
      createdById
      revokedById
      insertedAt
      updatedAt
    }
  }
`;
    LIST_DELEGATION_GRANTS_QUERY = `
  query DelegationGrants($filter: DelegationGrantFilterInput) {
    delegationGrants(filter: $filter) {
      id
      scope
      sessionId
      workspaceRef
      agentId
      permissions
      source
      expiresAt
      revokedAt
      expiredAt
      createdById
      revokedById
      insertedAt
      updatedAt
    }
  }
`;
    ACTIVE_DELEGATION_GRANTS_QUERY = `
  query ActiveDelegationGrants {
    activeDelegationGrants {
      id
      scope
      sessionId
      workspaceRef
      agentId
      permissions
      source
      expiresAt
      revokedAt
      expiredAt
      createdById
      revokedById
      insertedAt
      updatedAt
    }
  }
`;
    REVOKE_DELEGATION_GRANT_MUTATION = `
  mutation RevokeDelegationGrant($id: ID!) {
    revokeDelegationGrant(id: $id) {
      id
      scope
      sessionId
      workspaceRef
      agentId
      permissions
      source
      expiresAt
      revokedAt
      expiredAt
      createdById
      revokedById
      insertedAt
      updatedAt
    }
  }
`;
    REVOKE_DELEGATION_GRANTS_MUTATION = `
  mutation RevokeDelegationGrants($filter: DelegationGrantFilterInput) {
    revokeDelegationGrants(filter: $filter) {
      revokedCount
    }
  }
`;
    EVALUATE_INTERRUPT_QUERY = `
  query EvaluateInterrupt($handle: String!) {
    evaluateInterrupt(handle: $handle) {
      allowed
      reason
      autoResponse
    }
  }
`;
    CALIBRATION_PROFILES_QUERY = `
  query CalibrationProfiles {
    calibrationProfiles {
      id
      model
      framework
      sampleSize
      medianDurationMinutes
      successRate
      overrideRate
      p25DurationMinutes
      p75DurationMinutes
      durationCiLower
      durationCiUpper
      successRateCiLower
      successRateCiUpper
      confidenceLevel
      tier
      status
      tasksToHighConfidence
      insertedAt
      updatedAt
    }
  }
`;
    VERDICT_SETTINGS_QUERY = `
  query VerdictSettings {
    verdictSettings {
      id
      thresholds {
        online {
          maxFiles
          maxEstimatedMinutes
        }
        busy {
          maxFiles
          maxEstimatedMinutes
        }
        limited {
          maxFiles
          maxEstimatedMinutes
        }
        offline {
          maxFiles
          maxEstimatedMinutes
        }
      }
      defaultWrapUpMode
      wrapUpThresholdMinutes
      insertedAt
      updatedAt
    }
  }
`;
    UPDATE_VERDICT_SETTINGS_MUTATION = `
  mutation UpdateVerdictSettings($thresholds: VerdictModeThresholdsInput, $defaultWrapUpMode: WrapUpMode, $wrapUpThresholdMinutes: Int) {
    updateVerdictSettings(thresholds: $thresholds, defaultWrapUpMode: $defaultWrapUpMode, wrapUpThresholdMinutes: $wrapUpThresholdMinutes) {
      id
      thresholds {
        online {
          maxFiles
          maxEstimatedMinutes
        }
        busy {
          maxFiles
          maxEstimatedMinutes
        }
        limited {
          maxFiles
          maxEstimatedMinutes
        }
        offline {
          maxFiles
          maxEstimatedMinutes
        }
      }
      defaultWrapUpMode
      wrapUpThresholdMinutes
      insertedAt
      updatedAt
    }
  }
`;
    DIGEST_SUMMARIES_QUERY = `
  query DigestSummaries($latest: Int) {
    digestSummaries(latest: $latest) {
      id
      actorRef
      actorLabel
      sourceType
      action
      channelRef
      events {
        description
        insertedAt
      }
      entryCount
      firstEventAt
      lastEventAt
    }
  }
`;
    DISMISS_DIGEST_ENTRY_MUTATION = `
  mutation DismissDigestEntry($id: ID!) {
    dismissDigestEntry(id: $id) {
      id
      actorRef
      actorLabel
      sourceType
      action
      channelRef
      events {
        description
        insertedAt
      }
      entryCount
      firstEventAt
      lastEventAt
    }
  }
`;
    AUTO_RESPONDER_SETTINGS_QUERY = `
  query AutoResponderSettings {
    autoResponderSettings {
      id
      busyText
      limitedText
      offlineText
      insertedAt
      updatedAt
    }
  }
`;
    UPDATE_AUTO_RESPONDER_SETTINGS_MUTATION = `
  mutation UpdateAutoResponderSettings($busyText: String, $limitedText: String, $offlineText: String) {
    updateAutoResponderSettings(busyText: $busyText, limitedText: $limitedText, offlineText: $offlineText) {
      id
      busyText
      limitedText
      offlineText
      insertedAt
      updatedAt
    }
  }
`;
    TEAMS_QUERY = `
  query Teams($id: ID) {
    teams(id: $id) {
      id
      name
      icon
      description
      members {
        id
        email
        name
        location
        avatar
      }
    }
  }
`;
    COMPANY_QUERY = `
  query Company {
    company {
      id
      name
      teams {
        id
        name
        icon
        description
      }
    }
  }
`;
    TEAM_PRESENCE_QUERY = `
  query TeamPresence($teamId: ID!) {
    teamPresence(teamId: $teamId) {
      userId
      onlineAt
      connectionType
    }
  }
`;
    REPORT_OUTCOME_MUTATION = `
  mutation ReportOutcome($input: OutcomeInput!) {
    reportOutcome(input: $input) {
      id
      outcome
      actualDurationMinutes
      filesModified
      linesChanged
      errorCategory
      testsPassed
      tokensUsed
      retryCount
      turnCount
      scopeChanged
      redirectCount
      distinctTaskCount
      dataQualityScore
      insertedAt
    }
  }
`;
    AUTOPILOT_POLICY_QUERY = `
  query AutopilotPolicy($mode: Mode!) {
    autopilotPolicy(mode: $mode) {
      classifierVersion
      latitude
      escalationStrategy
      sandboxPreference
      identityActionOverrides {
        actionKey
        strategy
      }
      houseRules
    }
  }
`;
  }
});

// node_modules/@headsdown/sdk/dist/client.js
function serializeAgentRunEventInput(input) {
  const progressPayload2 = input.progressPayload ? {
    elapsedSeconds: input.progressPayload.elapsedSeconds,
    toolCallsCount: input.progressPayload.toolCallsCount,
    toolReadCount: input.progressPayload.toolReadCount,
    toolWriteCount: input.progressPayload.toolWriteCount,
    toolExternalCount: input.progressPayload.toolExternalCount,
    filesReadBucket: toAgentRunGraphQLEnum(input.progressPayload.filesReadBucket),
    filesModifiedBucket: toAgentRunGraphQLEnum(input.progressPayload.filesModifiedBucket),
    validationLevel: toGraphQLEnum(input.progressPayload.validationLevel),
    validationStatus: toGraphQLEnum(input.progressPayload.validationStatus),
    retryCount: input.progressPayload.retryCount,
    failureCount: input.progressPayload.failureCount,
    scopeChanged: input.progressPayload.scopeChanged,
    redirectCount: input.progressPayload.redirectCount,
    progressState: toGraphQLEnum(input.progressPayload.progressState),
    testsPassed: input.progressPayload.testsPassed,
    validationKind: input.progressPayload.validationKind,
    noProgressDurationSeconds: input.progressPayload.noProgressDurationSeconds,
    scopeGrowthBucket: input.progressPayload.scopeGrowthBucket ? toAgentRunGraphQLEnum(input.progressPayload.scopeGrowthBucket) : void 0,
    confidenceBucket: input.progressPayload.confidenceBucket ? toGraphQLEnum(input.progressPayload.confidenceBucket) : void 0,
    spendEstimateBucket: input.progressPayload.spendEstimateBucket ? toAgentRunGraphQLEnum(input.progressPayload.spendEstimateBucket) : void 0,
    blockedReasonCode: input.progressPayload.blockedReasonCode
  } : void 0;
  return stripUndefined2({
    ...input,
    privacyMode: toGraphQLEnum(input.privacyMode),
    progressPayload: progressPayload2 ? stripUndefined2(progressPayload2) : void 0
  });
}
function toAgentRunGraphQLEnum(value) {
  return /^\d/.test(value) ? `_${value.toUpperCase()}` : value.toUpperCase();
}
function validateSessionTimeboxExtensionRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("Session timebox extension request input is required.", "input");
  }
  for (const key of Object.keys(input)) {
    if (!TIMEBOX_EXTENSION_REQUEST_FIELDS.has(key)) {
      throw new ValidationError("Session timebox extension requests only accept sessionId and requestedExtensionMinutes.", key);
    }
  }
  if (!isSafeSessionToken(input.sessionId)) {
    throw new ValidationError("sessionId must be a privacy-safe opaque token.", "sessionId");
  }
  if (!Number.isInteger(input.requestedExtensionMinutes) || input.requestedExtensionMinutes <= 0 || input.requestedExtensionMinutes > MAX_REQUESTED_EXTENSION_MINUTES) {
    throw new ValidationError(`requestedExtensionMinutes must be an integer between 1 and ${MAX_REQUESTED_EXTENSION_MINUTES}.`, "requestedExtensionMinutes");
  }
}
function isSafeSessionToken(value) {
  return typeof value === "string" && value.trim() === value && SAFE_SESSION_TOKEN_PATTERN.test(value) && !value.includes("/") && !value.includes("\\") && !value.includes("://") && !value.includes(".git");
}
function validateAvailabilityOverrideInput(input) {
  if (!input || typeof input !== "object") {
    throw new ValidationError("Availability override input is required.", "input");
  }
  if (!input.mode) {
    throw new ValidationError("Availability override mode is required.", "mode");
  }
  if (input.mode !== "online" && input.mode !== "busy" && input.mode !== "limited" && input.mode !== "offline") {
    throw new ValidationError("Availability override mode is invalid.", "mode");
  }
  const hasDuration = input.durationMinutes !== void 0;
  const hasExpiresAt = input.expiresAt !== void 0;
  if (hasDuration === hasExpiresAt) {
    throw new ValidationError("Exactly one of durationMinutes or expiresAt is required.", "durationMinutes");
  }
  if (hasDuration && (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0)) {
    throw new ValidationError("durationMinutes must be a positive integer.", "durationMinutes");
  }
  if (hasExpiresAt && (!input.expiresAt || Number.isNaN(Date.parse(input.expiresAt)))) {
    throw new ValidationError("expiresAt must be a valid timestamp.", "expiresAt");
  }
}
function validateDelegationGrantInput(input) {
  if (!input.permissions || input.permissions.length === 0) {
    throw new ValidationError("Delegation grant permissions must include at least one permission.", "permissions");
  }
  if (input.scope === "session" && !isNonEmptyString(input.sessionId)) {
    throw new ValidationError("sessionId is required for session scope.", "sessionId");
  }
  if (input.scope === "workspace" && !isNonEmptyString(input.workspaceRef)) {
    throw new ValidationError("workspaceRef is required for workspace scope.", "workspaceRef");
  }
}
function validateDelegationGrantFilter(filter) {
  if (!filter)
    return;
  if (filter.scope === "session" && filter.sessionId !== void 0 && !isNonEmptyString(filter.sessionId)) {
    throw new ValidationError("sessionId must be a non-empty string when provided.", "sessionId");
  }
  if (filter.scope === "workspace" && filter.workspaceRef !== void 0 && !isNonEmptyString(filter.workspaceRef)) {
    throw new ValidationError("workspaceRef must be a non-empty string when provided.", "workspaceRef");
  }
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function validateContractInput(input) {
  if (!input.ruleSetParams || typeof input.ruleSetParams !== "object") {
    return;
  }
  for (const key of Object.keys(input.ruleSetParams)) {
    if (WRAP_UP_FIELDS.has(key)) {
      throw new ValidationError("Wrap-Up fields are not valid in createContract. Configure Wrap-Up through updateVerdictSettings or per-task deliveryMode.", "ruleSetParams");
    }
  }
}
function validateVerdictSettingsInput(input) {
  if (!input.modeThresholds || typeof input.modeThresholds !== "object") {
    return;
  }
  for (const key of Object.keys(input.modeThresholds)) {
    if (AVAILABILITY_FIELDS.has(key)) {
      throw new ValidationError("Availability fields are not valid in updateVerdictSettings modeThresholds.", "modeThresholds");
    }
  }
}
function mapDelegationAuthError(error) {
  if (error instanceof ApiError && error.message.includes("Delegation grants require session-token auth")) {
    return new AuthError("Delegation grant management requires a session-token auth path. API keys cannot create or revoke grants.");
  }
  return error instanceof Error ? error : new ApiError(String(error));
}
function mapPresetAuthError(error) {
  if (error instanceof ApiError && error.message.includes("Missing actor context")) {
    return new AuthError("applyPreset with API key authorization requires actor context. Set actorContext on the client or use withActor().");
  }
  return error instanceof Error ? error : new ApiError(String(error));
}
function mapAvailabilityOverrideAuthError(error) {
  if (error instanceof AuthError)
    return error;
  if (error instanceof ApiError && error.message.includes("Missing actor context")) {
    return new AuthError("Availability override create/cancel requires actor context or delegated permission. Set actorContext on the client or use withActor().");
  }
  return error instanceof Error ? error : new ApiError(String(error));
}
function validateActorContext(actorContext) {
  if (!actorContext)
    return;
  validateActorContextField("source", actorContext.source, true);
  validateActorContextField("agentId", actorContext.agentId, false);
  validateActorContextField("sessionId", actorContext.sessionId, false);
  validateActorContextField("workspaceRef", actorContext.workspaceRef, false);
}
function validateActorContextField(field, value, required) {
  if (value === void 0 || value === null) {
    if (required) {
      throw new ValidationError(`Actor context ${field} is required.`, `actorContext.${field}`);
    }
    return;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`Actor context ${field} must be a non-empty string when provided.`, `actorContext.${field}`);
  }
}
function resolveApiKey(explicit) {
  if (explicit)
    return explicit;
  return process.env.HEADSDOWN_API_KEY || void 0;
}
function stripUndefined2(obj) {
  const result2 = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== void 0)
      result2[key] = value;
  }
  return result2;
}
function randomHex2(bytes) {
  try {
    const array = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    const { randomBytes: randomBytes2 } = __require("node:crypto");
    return randomBytes2(bytes).toString("hex");
  }
}
var HeadsDownClient, WRAP_UP_FIELDS, SAFE_SESSION_TOKEN_PATTERN, TIMEBOX_EXTENSION_REQUEST_FIELDS, MAX_REQUESTED_EXTENSION_MINUTES, AVAILABILITY_FIELDS;
var init_client = __esm({
  "node_modules/@headsdown/sdk/dist/client.js"() {
    init_agent_control_actions();
    init_agent_run_events();
    init_auth();
    init_errors();
    init_graphql();
    init_queries();
    HeadsDownClient = class _HeadsDownClient {
      graphql;
      clientOptions;
      constructor(options = {}) {
        const apiKey = resolveApiKey(options.apiKey);
        if (!apiKey) {
          throw new AuthError("No API key provided. Pass { apiKey } explicitly, set HEADSDOWN_API_KEY, or use HeadsDownClient.fromCredentials() to load from disk.");
        }
        validateActorContext(options.actorContext);
        this.clientOptions = {
          apiKey,
          baseUrl: options.baseUrl,
          fetch: options.fetch,
          timeout: options.timeout,
          retry: options.retry,
          hooks: options.hooks,
          actorContext: options.actorContext
        };
        this.graphql = new GraphQLClient({
          apiKey,
          baseUrl: options.baseUrl,
          fetch: options.fetch,
          timeout: options.timeout,
          retries: options.retry?.retries,
          retryDelayMs: options.retry?.retryDelayMs,
          hooks: options.hooks,
          actorContext: options.actorContext
        });
      }
      /**
       * Create a derived client with actor context override for scoped authorization.
       *
       * @example
       * ```ts
       * await client.withActor({ source: "pi", sessionId: "sess_123" }).submitProposal({ ... });
       * ```
       */
      withActor(actorContext) {
        return new _HeadsDownClient({ ...this.clientOptions, actorContext });
      }
      /**
       * Create a client using credentials saved on disk
       * (from Device Flow auth or manual setup).
       */
      static async fromCredentials(options) {
        const store = new CredentialStore(options?.credentialsPath ? { path: options.credentialsPath } : void 0);
        const creds = await store.load();
        if (!creds) {
          throw new AuthError(`No credentials found at ${store.filePath}. Run Device Flow authentication first.`);
        }
        return new _HeadsDownClient({ ...options, apiKey: creds.apiKey });
      }
      /**
       * Authenticate via Device Flow: start the flow, let the caller handle the user
       * interaction, poll for approval, save credentials, and return a ready client.
       *
       * @param onUserCode - Called with the authorization details so the caller can
       *   display the verification URL and user code to the user.
       * @param options - Device Flow and client options.
       * @param signal - Optional AbortSignal to cancel the flow.
       */
      static async authenticate(onUserCode, options, signal) {
        const flow = new DeviceFlow({
          baseUrl: options?.baseUrl,
          fetch: options?.fetch
        });
        const auth = await flow.start(options?.label);
        await onUserCode(auth);
        const apiKey = await flow.poll(auth.deviceCode, auth.interval, auth.expiresIn, signal);
        const store = new CredentialStore(options?.credentialsPath ? { path: options.credentialsPath } : void 0);
        await store.save(apiKey, options?.label);
        return new _HeadsDownClient({
          apiKey,
          baseUrl: options?.baseUrl,
          fetch: options?.fetch,
          timeout: options?.timeout,
          retry: options?.retry,
          hooks: options?.hooks,
          actorContext: options?.actorContext
        });
      }
      // === Availability ===
      /** Get the user's active availability contract. Returns null if no contract is set. */
      async getActiveContract() {
        try {
          const data = await this.graphql.request(ACTIVE_CONTRACT_QUERY);
          return data.activeContract;
        } catch (error) {
          if (error instanceof Error && error.message.includes("No active contract")) {
            return null;
          }
          throw error;
        }
      }
      /** Get the user's current schedule resolution. Optionally pass an ISO 8601 datetime to check at a specific time. */
      async getSchedule(options) {
        const variables = options?.at ? { at: options.at } : void 0;
        const data = await this.graphql.request(SCHEDULE_QUERY, variables);
        if (!data.schedule) {
          throw new ApiError("HeadsDown API returned no schedule data.");
        }
        return data.schedule;
      }
      /**
       * Get the current HeadsDown call and agent-control read models.
       */
      async getAgentControlOverview() {
        const data = await this.graphql.request(AGENT_CONTROL_OVERVIEW_QUERY);
        return data.agentControlOverview;
      }
      /**
       * Request a user-approved extension for a session timebox.
       * This does not extend the session directly; it creates a metadata-only HeadsDown approval request.
       */
      async requestSessionTimeboxExtension(input) {
        validateSessionTimeboxExtensionRequest(input);
        const data = await this.graphql.request(REQUEST_SESSION_TIMEBOX_EXTENSION_MUTATION, {
          sessionId: input.sessionId.trim(),
          requestedExtensionMinutes: input.requestedExtensionMinutes
        });
        const session = data.requestSessionTimeboxExtension;
        const request = session?.pendingTimeboxExtensionRequest;
        if (!session || !request) {
          throw new ApiError("HeadsDown API returned no requestSessionTimeboxExtension data.");
        }
        return { sessionId: session.sessionId, request };
      }
      /**
       * Get a privacy-safe intervention replay by task proposal/action target id.
       */
      async getInterventionReplay(proposalId) {
        if (!proposalId.trim()) {
          throw new ValidationError("Proposal ID is required.", "proposalId");
        }
        const variables = { proposalId };
        const data = await this.graphql.request(INTERVENTION_REPLAY_QUERY, variables);
        return data.interventionReplay;
      }
      /**
       * Apply a canonical HeadsDown action to a run.
       * Prefer the named helper methods for common actions; use this for newly added canonical actions.
       */
      async applyHeadsDownAction(actionKey, input) {
        return this.executeHeadsDownAction(actionKey, input);
      }
      /**
       * Apply continue to let approved work proceed.
       */
      async continueRun(input) {
        return this.executeHeadsDownAction("continue", input);
      }
      /**
       * Apply continue_with_limit to proceed inside tighter bounds.
       */
      async continueWithLimit(input) {
        return this.executeHeadsDownAction("continue_with_limit", input);
      }
      /**
       * Apply narrow_scope to keep the run inside a tighter slice.
       */
      async narrowScope(input) {
        return this.executeHeadsDownAction("narrow_scope", input);
      }
      /**
       * Apply ask_user when the run needs a human decision before going deeper.
       */
      async askUser(input) {
        return this.executeHeadsDownAction("ask_user", input);
      }
      /**
       * Apply queue_for_later to defer work without losing the thread.
       */
      async queueForLater(input) {
        return this.executeHeadsDownAction("queue_for_later", input);
      }
      /**
       * Apply queue_for_morning to keep non-urgent work queued for the next work window.
       */
      async queueForMorning(input) {
        return this.executeHeadsDownAction("queue_for_morning", input);
      }
      /**
       * Apply pause_and_summarize to save a handoff before a run drifts further.
       */
      async pauseAndSummarize(input) {
        return this.executeHeadsDownAction("pause_and_summarize", input);
      }
      /**
       * Apply stop_run to halt the run immediately.
       */
      async stopRun(input) {
        return this.executeHeadsDownAction("stop_run", input);
      }
      /**
       * Apply resume_run to restart queued or paused work.
       */
      async resumeRun(input) {
        return this.executeHeadsDownAction("resume_run", input);
      }
      /**
       * Apply allow_once for a short temporary continuation window.
       */
      async allowOnce(input) {
        return this.executeHeadsDownAction("allow_once", input);
      }
      /**
       * Apply allow_for_duration for a temporary continuation window.
       */
      async allowForDuration(input) {
        return this.executeHeadsDownAction("allow_for_duration", input);
      }
      /**
       * Apply create_temporary_exception for an explicit temporary exception mode/window.
       */
      async createTemporaryException(input) {
        return this.executeHeadsDownAction("create_temporary_exception", input);
      }
      /**
       * Apply keep_queued to leave queued work untouched.
       */
      async keepQueued(input) {
        return this.executeHeadsDownAction("keep_queued", input);
      }
      /**
       * Get both contract and schedule in a single request.
       * This is the recommended way to check availability before starting work.
       * Optionally pass an ISO 8601 datetime to check at a specific time.
       */
      async getAvailability(options) {
        try {
          const variables = options?.at ? { at: options.at } : void 0;
          const data = await this.graphql.request(AVAILABILITY_QUERY, variables);
          if (!data.schedule) {
            throw new ApiError("HeadsDown API returned no schedule data.");
          }
          return {
            contract: data.activeContract,
            schedule: data.schedule
          };
        } catch (error) {
          if (error instanceof Error && error.message.includes("No active contract")) {
            const schedule = await this.getSchedule(options);
            return { contract: null, schedule };
          }
          throw error;
        }
      }
      // === Availability Overrides ===
      /** Get the active temporary availability override, if one exists. */
      async getActiveAvailabilityOverride() {
        const data = await this.graphql.request(ACTIVE_AVAILABILITY_OVERRIDE_QUERY);
        return data.activeAvailabilityOverride ?? null;
      }
      /** Create a temporary availability override for the authenticated user. */
      async createAvailabilityOverride(input) {
        validateAvailabilityOverrideInput(input);
        const variables = {
          input: stripUndefined2({
            mode: toGraphQLEnum(input.mode),
            durationMinutes: input.durationMinutes,
            expiresAt: input.expiresAt,
            reason: input.reason,
            source: input.source ?? "sdk"
          })
        };
        try {
          const data = await this.graphql.request(CREATE_AVAILABILITY_OVERRIDE_MUTATION, variables);
          if (!data.createAvailabilityOverride) {
            throw new ApiError("HeadsDown API returned no createAvailabilityOverride data.");
          }
          return data.createAvailabilityOverride;
        } catch (error) {
          throw mapAvailabilityOverrideAuthError(error);
        }
      }
      /** Cancel a temporary availability override by id. */
      async cancelAvailabilityOverride(id, reason, source = "sdk") {
        if (!id?.trim()) {
          throw new ValidationError("Availability override ID is required.", "id");
        }
        try {
          const data = await this.graphql.request(CANCEL_AVAILABILITY_OVERRIDE_MUTATION, stripUndefined2({
            id,
            reason,
            source
          }));
          if (!data.cancelAvailabilityOverride) {
            throw new ApiError("HeadsDown API returned no cancelAvailabilityOverride data.");
          }
          return data.cancelAvailabilityOverride;
        } catch (error) {
          throw mapAvailabilityOverrideAuthError(error);
        }
      }
      // === Verdicts ===
      /**
       * Submit a task proposal for verdict evaluation.
       * HeadsDown evaluates the proposal against the user's current availability.
       *
       * @returns The verdict: `approved` (proceed) or `deferred` (postpone/reduce scope).
       */
      async submitProposal(input) {
        if (!input.description?.trim()) {
          throw new ValidationError("Proposal description is required.", "description");
        }
        if (!input.agentRef?.trim()) {
          throw new ValidationError("Agent reference is required.", "agentRef");
        }
        const sourceRef = input.sourceRef ?? `${input.agentRef}-${Date.now()}-${randomHex2(6)}`;
        const idempotencyKey = input.idempotencyKey ?? `${input.agentRef}-${Date.now()}-${randomHex2(8)}`;
        const variables = {
          input: stripUndefined2({
            agentRef: input.agentRef,
            model: input.model,
            framework: input.framework,
            description: input.description.trim(),
            estimatedFiles: input.estimatedFiles,
            estimatedMinutes: input.estimatedMinutes,
            scopeSummary: input.scopeSummary,
            sourceRef,
            idempotencyKey,
            deliveryMode: input.deliveryMode ? toGraphQLEnum(input.deliveryMode) : void 0
          })
        };
        const data = await this.graphql.request(SUBMIT_PROPOSAL_MUTATION, variables);
        if (!data.submitProposal) {
          throw new ApiError("HeadsDown API returned no submitProposal data.");
        }
        return data.submitProposal;
      }
      /**
       * Override a verdict decision.
       * Lets a user change a deferred verdict to approved, or vice versa.
       */
      async overrideVerdict(input) {
        if (!input.proposalId?.trim()) {
          throw new ValidationError("Proposal ID is required.", "proposalId");
        }
        const variables = {
          input: stripUndefined2({
            proposalId: input.proposalId,
            overrideVerdict: toGraphQLEnum(input.overrideVerdict),
            reason: input.reason
          })
        };
        const data = await this.graphql.request(OVERRIDE_VERDICT_MUTATION, variables);
        if (!data.overrideVerdict) {
          throw new ApiError("HeadsDown API returned no overrideVerdict data.");
        }
        return data.overrideVerdict;
      }
      // === Delegation Grants ===
      /**
       * Create a delegation grant for actor-scoped authorization.
       * Session scope requires sessionId, workspace scope requires workspaceRef.
       */
      async createDelegationGrant(input) {
        validateDelegationGrantInput(input);
        const variables = {
          input: stripUndefined2({
            scope: toGraphQLEnum(input.scope),
            sessionId: input.sessionId,
            workspaceRef: input.workspaceRef,
            agentId: input.agentId,
            permissions: input.permissions.map((permission) => toGraphQLEnum(permission)),
            durationMinutes: input.durationMinutes,
            expiresAt: input.expiresAt,
            source: input.source
          })
        };
        try {
          const data = await this.graphql.request(CREATE_DELEGATION_GRANT_MUTATION, variables);
          if (!data.createDelegationGrant) {
            throw new ApiError("HeadsDown API returned no createDelegationGrant data.");
          }
          return data.createDelegationGrant;
        } catch (error) {
          throw mapDelegationAuthError(error);
        }
      }
      /** List delegation grants, optionally filtered. */
      async listDelegationGrants(filter) {
        validateDelegationGrantFilter(filter);
        const variables = filter ? {
          filter: stripUndefined2({
            active: filter.active,
            scope: filter.scope ? toGraphQLEnum(filter.scope) : void 0,
            sessionId: filter.sessionId,
            workspaceRef: filter.workspaceRef,
            agentId: filter.agentId,
            source: filter.source
          })
        } : void 0;
        const data = await this.graphql.request(LIST_DELEGATION_GRANTS_QUERY, variables);
        return data.delegationGrants ?? [];
      }
      /** List currently active delegation grants. */
      async listActiveDelegationGrants() {
        const data = await this.graphql.request(ACTIVE_DELEGATION_GRANTS_QUERY);
        return data.activeDelegationGrants ?? [];
      }
      /** Revoke a delegation grant by id. */
      async revokeDelegationGrant(id) {
        if (!id?.trim()) {
          throw new ValidationError("Delegation grant ID is required.", "id");
        }
        try {
          const data = await this.graphql.request(REVOKE_DELEGATION_GRANT_MUTATION, { id });
          if (!data.revokeDelegationGrant) {
            throw new ApiError("HeadsDown API returned no revokeDelegationGrant data.");
          }
          return data.revokeDelegationGrant;
        } catch (error) {
          throw mapDelegationAuthError(error);
        }
      }
      /** Revoke delegation grants in bulk, optionally filtered. */
      async revokeDelegationGrants(filter) {
        validateDelegationGrantFilter(filter);
        const variables = filter ? {
          filter: stripUndefined2({
            active: filter.active,
            scope: filter.scope ? toGraphQLEnum(filter.scope) : void 0,
            sessionId: filter.sessionId,
            workspaceRef: filter.workspaceRef,
            agentId: filter.agentId,
            source: filter.source
          })
        } : void 0;
        try {
          const data = await this.graphql.request(REVOKE_DELEGATION_GRANTS_MUTATION, variables);
          if (!data.revokeDelegationGrants) {
            throw new ApiError("HeadsDown API returned no revokeDelegationGrants data.");
          }
          return data.revokeDelegationGrants;
        } catch (error) {
          throw mapDelegationAuthError(error);
        }
      }
      /** List previously submitted proposals, optionally filtered by verdict or limited. */
      async listProposals(options) {
        const variables = {};
        if (options?.verdict)
          variables.verdict = toGraphQLEnum(options.verdict);
        if (options?.latest !== void 0)
          variables.latest = options.latest;
        const data = await this.graphql.request(LIST_PROPOSALS_QUERY, Object.keys(variables).length > 0 ? variables : void 0);
        return data.proposals ?? [];
      }
      // === Presets ===
      /** List the user's saved availability presets. */
      async listPresets() {
        const data = await this.graphql.request(LIST_PRESETS_QUERY);
        return data.presets ?? [];
      }
      /** Apply a preset to create a new availability contract. */
      async applyPreset(presetId) {
        if (!presetId?.trim()) {
          throw new ValidationError("Preset ID is required.", "presetId");
        }
        try {
          const data = await this.graphql.request(APPLY_PRESET_MUTATION, {
            id: presetId
          });
          if (!data.applyPreset) {
            throw new ApiError("HeadsDown API returned no applyPreset data.");
          }
          return data.applyPreset;
        } catch (error) {
          throw mapPresetAuthError(error);
        }
      }
      // === Contracts ===
      /**
       * Create a new availability contract directly (without a preset).
       * This sets the user's current mode, status, and availability.
       */
      async createContract(input) {
        validateContractInput(input);
        const variables = {
          input: stripUndefined2({
            mode: toGraphQLEnum(input.mode),
            autoRespond: input.autoRespond,
            status: input.status,
            statusEmoji: input.statusEmoji,
            statusText: input.statusText,
            lock: input.lock,
            duration: input.duration,
            ruleSetType: input.ruleSetType,
            ruleSetParams: input.ruleSetParams
          })
        };
        const data = await this.graphql.request(CREATE_CONTRACT_MUTATION, variables);
        if (!data.createContract) {
          throw new ApiError("HeadsDown API returned no createContract data.");
        }
        return data.createContract;
      }
      // === Profile ===
      /** Get the authenticated user's profile. Useful for verifying authentication. */
      async getProfile() {
        const data = await this.graphql.request(PROFILE_QUERY);
        if (!data.profile) {
          throw new ApiError("HeadsDown API returned no profile data.");
        }
        return data.profile;
      }
      // === Interrupts ===
      /**
       * Evaluate whether interrupting a user is allowed based on their current availability.
       * Returns whether the interrupt is allowed, the reason, and an optional auto-response message.
       */
      async evaluateInterrupt(handle) {
        if (!handle?.trim()) {
          throw new ValidationError("Handle is required.", "handle");
        }
        const data = await this.graphql.request(EVALUATE_INTERRUPT_QUERY, {
          handle
        });
        if (!data.evaluateInterrupt) {
          throw new ApiError("HeadsDown API returned no evaluateInterrupt data.");
        }
        return data.evaluateInterrupt;
      }
      // === Digest ===
      /**
       * List digest summaries: aggregated notifications that arrived while the user was in focus mode.
       * Each summary groups events from the same actor and source.
       */
      async listDigestSummaries(options) {
        const variables = {};
        if (options?.latest !== void 0)
          variables.latest = options.latest;
        const data = await this.graphql.request(DIGEST_SUMMARIES_QUERY, Object.keys(variables).length > 0 ? variables : void 0);
        return data.digestSummaries ?? [];
      }
      /** Dismiss a digest summary entry by id. */
      async dismissDigestEntry(id) {
        if (!id?.trim()) {
          throw new ValidationError("Digest entry ID is required.", "id");
        }
        const data = await this.graphql.request(DISMISS_DIGEST_ENTRY_MUTATION, { id });
        if (!data.dismissDigestEntry) {
          throw new ApiError("HeadsDown API returned no dismissDigestEntry data.");
        }
        return data.dismissDigestEntry;
      }
      // === Auto Responder ===
      /** Get auto-responder message templates. */
      async getAutoResponderSettings() {
        const data = await this.graphql.request(AUTO_RESPONDER_SETTINGS_QUERY);
        if (!data.autoResponderSettings) {
          throw new ApiError("HeadsDown API returned no autoResponderSettings data.");
        }
        return data.autoResponderSettings;
      }
      /** Update auto-responder message templates. */
      async updateAutoResponderSettings(input) {
        const variables = stripUndefined2({
          busyText: input.busyText,
          limitedText: input.limitedText,
          offlineText: input.offlineText
        });
        const data = await this.graphql.request(UPDATE_AUTO_RESPONDER_SETTINGS_MUTATION, Object.keys(variables).length > 0 ? variables : void 0);
        if (!data.updateAutoResponderSettings) {
          throw new ApiError("HeadsDown API returned no updateAutoResponderSettings data.");
        }
        return data.updateAutoResponderSettings;
      }
      // === Teams ===
      /** List teams for the current user, optionally filtered by team id. */
      async listTeams(options) {
        const variables = options?.id ? { id: options.id } : void 0;
        const data = await this.graphql.request(TEAMS_QUERY, variables);
        return data.teams ?? [];
      }
      /** Get the current user's company and teams. */
      async getCompany() {
        const data = await this.graphql.request(COMPANY_QUERY);
        return data.company;
      }
      /** List currently online members for a team. */
      async listTeamPresence(teamId) {
        if (!teamId?.trim()) {
          throw new ValidationError("Team ID is required.", "teamId");
        }
        const data = await this.graphql.request(TEAM_PRESENCE_QUERY, {
          teamId
        });
        return data.teamPresence ?? [];
      }
      // === Calibration Profiles ===
      /** List calibration profiles for the current user's model/framework pairs. */
      async listCalibrationProfiles() {
        const data = await this.graphql.request(CALIBRATION_PROFILES_QUERY);
        return data.calibrationProfiles ?? [];
      }
      // === Verdict Settings ===
      /** Get the current verdict evaluation settings. */
      async getVerdictSettings() {
        const data = await this.graphql.request(VERDICT_SETTINGS_QUERY);
        if (!data.verdictSettings) {
          throw new ApiError("HeadsDown API returned no verdictSettings data.");
        }
        return data.verdictSettings;
      }
      /** Update verdict evaluation settings. */
      async updateVerdictSettings(input) {
        if (!input || Object.keys(input).length === 0) {
          throw new ValidationError("At least one verdict settings field must be provided.", "input");
        }
        validateVerdictSettingsInput(input);
        const variables = stripUndefined2({
          thresholds: input.thresholds,
          defaultWrapUpMode: input.defaultWrapUpMode ? toGraphQLEnum(input.defaultWrapUpMode) : void 0,
          wrapUpThresholdMinutes: input.wrapUpThresholdMinutes
        });
        const data = await this.graphql.request(UPDATE_VERDICT_SETTINGS_MUTATION, variables);
        if (!data.updateVerdictSettings) {
          throw new ApiError("HeadsDown API returned no updateVerdictSettings data.");
        }
        return data.updateVerdictSettings;
      }
      // === Agent run events ===
      /** Report a privacy-safe agent run event through the canonical taxonomy. */
      async reportAgentRunEvent(input) {
        const variables = { input: serializeAgentRunEventInput(buildAgentRunEventInput(input)) };
        const data = await this.graphql.request(REPORT_AGENT_RUN_EVENT_MUTATION, variables);
        if (!data.reportAgentRunEvent) {
          throw new ApiError("HeadsDown API returned no reportAgentRunEvent data.");
        }
        if (data.reportAgentRunEvent.error) {
          throw new ApiError(data.reportAgentRunEvent.error.message);
        }
        return data.reportAgentRunEvent;
      }
      async reportAgentRunStarted(context, payload) {
        return this.reportAgentRunEvent(startedEvent(context, payload));
      }
      async reportAgentRunProgress(context, progressPayload2) {
        return this.reportAgentRunEvent(progressEvent(context, progressPayload2));
      }
      async reportScopeDriftDetected(context, payload) {
        return this.reportAgentRunEvent(scopeDriftDetectedEvent(context, payload));
      }
      async reportAgentRunContinuationSaved(context, payload) {
        return this.reportAgentRunEvent(continuationSavedEvent(context, payload));
      }
      async reportAgentRunQueuedForMorning(context, payload) {
        return this.reportAgentRunEvent(queuedForMorningEvent(context, payload));
      }
      async reportAgentRunQueuedForLater(context, payload) {
        return this.reportAgentRunEvent(queuedForLaterEvent(context, payload));
      }
      async reportAgentRunResumed(context, payload) {
        return this.reportAgentRunEvent(resumedEvent(context, payload));
      }
      async reportAgentRunCompleted(context, payload) {
        return this.reportAgentRunEvent(completedEvent(context, payload));
      }
      async reportAgentRunFailed(context, payload) {
        return this.reportAgentRunEvent(failedEvent(context, payload));
      }
      async reportAgentRunCancelled(context, payload) {
        return this.reportAgentRunEvent(cancelledEvent(context, payload));
      }
      async reportDeferredDecisionResolved(context, payload) {
        return this.reportAgentRunEvent(deferredDecisionResolvedEvent(context, payload));
      }
      async reportDeferredDecisionReAttempted(context, payload) {
        return this.reportAgentRunEvent(deferredDecisionReAttemptedEvent(context, payload));
      }
      async reportSteeringOutcome(context, payload) {
        return this.reportAgentRunEvent(steeringOutcomeReportedEvent(context, payload));
      }
      async listAgentRunEvents(args = {}) {
        const variables = stripUndefined2({
          runId: args.runId,
          eventType: args.eventType,
          resolutionKind: args.resolutionKind ? toGraphQLEnum(args.resolutionKind) : void 0,
          flaggedForReview: args.flaggedForReview,
          insertedAfter: args.insertedAfter,
          insertedBefore: args.insertedBefore,
          limit: args.limit
        });
        const data = await this.graphql.request(LIST_AGENT_RUN_EVENTS_QUERY, Object.keys(variables).length > 0 ? variables : void 0);
        return data.agentRunEvents ?? [];
      }
      // === Calibration ===
      /**
       * Report a task outcome (insert or update).
       * First call for a proposal creates the outcome. Subsequent calls update it.
       * This supports checkpoint-and-update semantics for reliable reporting.
       */
      async reportOutcome(input) {
        if (!input.proposalId?.trim()) {
          throw new ValidationError("Proposal ID is required.", "proposalId");
        }
        if (!input.outcome?.trim()) {
          throw new ValidationError("Outcome is required.", "outcome");
        }
        const variables = {
          input: stripUndefined2({
            proposalId: input.proposalId,
            outcome: toGraphQLEnum(input.outcome),
            actualDurationMinutes: input.actualDurationMinutes,
            filesModified: input.filesModified,
            linesChanged: input.linesChanged,
            errorCategory: input.errorCategory,
            testsPassed: input.testsPassed,
            tokensUsed: input.tokensUsed,
            retryCount: input.retryCount,
            turnCount: input.turnCount,
            scopeChanged: input.scopeChanged,
            redirectCount: input.redirectCount,
            distinctTaskCount: input.distinctTaskCount,
            metadata: input.metadata
          })
        };
        const data = await this.graphql.request(REPORT_OUTCOME_MUTATION, variables);
        if (!data.reportOutcome) {
          throw new ApiError("HeadsDown API returned no reportOutcome data.");
        }
        return data.reportOutcome;
      }
      async executeHeadsDownAction(actionKey, input) {
        if (!input.runId?.trim()) {
          throw new ValidationError("Run ID is required.", "runId");
        }
        const idempotencyKey = input.idempotencyKey ?? buildActionIdempotencyKey(actionKey, input.runId);
        const durationMinutes = "durationMinutes" in input && typeof input.durationMinutes === "number" ? input.durationMinutes : void 0;
        if (durationMinutes !== void 0 && (!Number.isInteger(durationMinutes) || durationMinutes <= 0)) {
          throw new ValidationError("durationMinutes must be a positive integer.", "durationMinutes");
        }
        const variables = {
          input: stripUndefined2({
            runId: input.runId,
            actionKey,
            sourceState: input.sourceState,
            actionExpiresAt: input.actionExpiresAt,
            expiresAt: input.expiresAt,
            reason: input.reason,
            client: input.client,
            source: input.source,
            durationMinutes,
            overrideExpiresAt: "overrideExpiresAt" in input ? input.overrideExpiresAt : void 0,
            mode: "mode" in input && input.mode ? toGraphQLEnum(input.mode) : void 0,
            idempotencyKey
          })
        };
        try {
          const data = await this.graphql.request(APPLY_HEADSDOWN_ACTION_MUTATION, variables);
          const payload = data.applyHeadsdownAction;
          if (!payload) {
            throw new ApiError("HeadsDown API returned no applyHeadsdownAction data.");
          }
          if (payload.error) {
            throw mapHeadsDownActionPayloadError(payload.error, { actionKey, runId: input.runId });
          }
          if (!payload.ok || !payload.result) {
            throw new ApiError("HeadsDown API reported action apply failure without an error payload.");
          }
          return payload;
        } catch (error) {
          throw mapHeadsDownActionError(error, { actionKey, runId: input.runId });
        }
      }
    };
    WRAP_UP_FIELDS = /* @__PURE__ */ new Set([
      "default_wrap_up_mode",
      "wrap_up_threshold_minutes",
      "delivery_mode",
      "wrapUpGuidance"
    ]);
    SAFE_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_.:-]{1,255}$/;
    TIMEBOX_EXTENSION_REQUEST_FIELDS = /* @__PURE__ */ new Set(["sessionId", "requestedExtensionMinutes"]);
    MAX_REQUESTED_EXTENSION_MINUTES = 480;
    AVAILABILITY_FIELDS = /* @__PURE__ */ new Set([
      "status",
      "statusEmoji",
      "statusText",
      "mode",
      "autoRespond",
      "lock"
    ]);
  }
});

// node_modules/@headsdown/sdk/dist/config.js
import { readFile as readFile2, writeFile as writeFile2, mkdir as mkdir2 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";
function isValidTrustLevel(value) {
  return typeof value === "string" && VALID_TRUST_LEVELS.includes(value);
}
var DEFAULT_CONFIG_DIR, DEFAULT_CONFIG_PATH, VALID_TRUST_LEVELS, DEFAULT_SENSITIVE_PATHS, DEFAULT_CONFIG, ConfigStore;
var init_config = __esm({
  "node_modules/@headsdown/sdk/dist/config.js"() {
    DEFAULT_CONFIG_DIR = join2(homedir2(), ".config", "headsdown");
    DEFAULT_CONFIG_PATH = join2(DEFAULT_CONFIG_DIR, "config.json");
    VALID_TRUST_LEVELS = ["advisory", "active", "guarded"];
    DEFAULT_SENSITIVE_PATHS = [
      ".env*",
      "**/.env*",
      ".ssh/*",
      "**/.ssh/*",
      "**/secrets/*",
      "**/secret/*",
      "package.json",
      "package-lock.json",
      "Dockerfile*",
      "docker-compose*",
      ".github/**",
      ".gitlab-ci*",
      ".circleci/**",
      "Makefile",
      "**/config/credentials*",
      "**/config/secrets*"
    ];
    DEFAULT_CONFIG = {
      trustLevel: "advisory",
      sensitivePaths: DEFAULT_SENSITIVE_PATHS,
      calibration: true
    };
    ConfigStore = class {
      path;
      constructor(options) {
        this.path = options?.path ?? DEFAULT_CONFIG_PATH;
      }
      /** Load configuration, falling back to defaults for missing or invalid values. */
      async load() {
        try {
          const raw = await readFile2(this.path, "utf-8");
          const parsed = JSON.parse(raw);
          return {
            trustLevel: isValidTrustLevel(parsed.trustLevel) ? parsed.trustLevel : DEFAULT_CONFIG.trustLevel,
            sensitivePaths: Array.isArray(parsed.sensitivePaths) ? parsed.sensitivePaths.filter((p) => typeof p === "string") : DEFAULT_CONFIG.sensitivePaths,
            calibration: typeof parsed.calibration === "boolean" ? parsed.calibration : DEFAULT_CONFIG.calibration
          };
        } catch {
          return { ...DEFAULT_CONFIG };
        }
      }
      /** Save configuration to disk. Creates parent directories if needed. */
      async save(config2) {
        const dir = join2(this.path, "..");
        await mkdir2(dir, { recursive: true });
        await writeFile2(this.path, JSON.stringify(config2, null, 2) + "\n", { mode: 420 });
      }
      /** Return the config file path. */
      get filePath() {
        return this.path;
      }
    };
  }
});

// node_modules/@headsdown/sdk/dist/proposals.js
import { readFile as readFile3, writeFile as writeFile3, mkdir as mkdir3 } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join3, dirname } from "node:path";
function defaultProposalStatePath() {
  const uid = process.getuid?.() ?? process.pid;
  return join3(tmpdir(), `headsdown-proposals-${uid}.json`);
}
var MAX_AGE_MS, ProposalStateStore;
var init_proposals = __esm({
  "node_modules/@headsdown/sdk/dist/proposals.js"() {
    MAX_AGE_MS = 8 * 60 * 60 * 1e3;
    ProposalStateStore = class {
      path;
      constructor(options) {
        this.path = options?.path ?? defaultProposalStatePath();
      }
      /** Record an approved proposal. Prunes stale entries. */
      async recordApproval(proposal) {
        const current = await this.loadRaw();
        const now = Date.now();
        const fresh = current.proposals.filter((p) => {
          const age = now - new Date(p.evaluatedAt).getTime();
          return age < MAX_AGE_MS;
        });
        const existing = fresh.findIndex((p) => p.id === proposal.id);
        if (existing >= 0) {
          fresh[existing] = proposal;
        } else {
          fresh.push(proposal);
        }
        await this.writeRaw({ proposals: fresh });
      }
      /** Check if any approved proposal exists within the TTL window. */
      async hasApprovedProposal() {
        const state = await this.loadRaw();
        const now = Date.now();
        return state.proposals.some((p) => {
          const age = now - new Date(p.evaluatedAt).getTime();
          return p.decision === "approved" && age < MAX_AGE_MS;
        });
      }
      /** Get the most recent approved proposal, if any. */
      async getLatestApproved() {
        const state = await this.loadRaw();
        const now = Date.now();
        const valid = state.proposals.filter((p) => p.decision === "approved" && now - new Date(p.evaluatedAt).getTime() < MAX_AGE_MS).sort((a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime());
        return valid[0] ?? null;
      }
      /** Return the state file path. */
      get filePath() {
        return this.path;
      }
      async loadRaw() {
        try {
          const raw = await readFile3(this.path, "utf-8");
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.proposals)) {
            return { proposals: parsed.proposals };
          }
          return { proposals: [] };
        } catch {
          return { proposals: [] };
        }
      }
      async writeRaw(state) {
        await mkdir3(dirname(this.path), { recursive: true });
        await writeFile3(this.path, JSON.stringify(state, null, 2) + "\n", { mode: 384 });
      }
    };
  }
});

// node_modules/@headsdown/sdk/dist/calibration.js
var DEFAULT_CHECKPOINT_INTERVAL_MS, MIN_CHECKPOINT_INTERVAL_MS, CalibrationTracker;
var init_calibration = __esm({
  "node_modules/@headsdown/sdk/dist/calibration.js"() {
    DEFAULT_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1e3;
    MIN_CHECKPOINT_INTERVAL_MS = 60 * 1e3;
    CalibrationTracker = class {
      client;
      proposalId;
      intervalMs;
      enabled;
      timer = null;
      startedAt = Date.now();
      disposed = false;
      // Accumulated signals
      turnCount = 0;
      scopeChanged = false;
      redirectCount = 0;
      distinctTaskCount = 1;
      filesModified = 0;
      linesChanged = 0;
      tokensUsed = 0;
      retryCount = 0;
      testsPassed;
      errorCategory;
      metadata = {};
      constructor(client, proposalId, options) {
        this.client = client;
        this.proposalId = proposalId;
        this.enabled = options?.enabled ?? true;
        this.intervalMs = Math.max(MIN_CHECKPOINT_INTERVAL_MS, options?.intervalMs ?? DEFAULT_CHECKPOINT_INTERVAL_MS);
      }
      /** Start the checkpoint timer. Call once after creating the tracker. */
      start() {
        if (!this.enabled || this.disposed)
          return;
        this.startedAt = Date.now();
        this.timer = setInterval(() => {
          this.checkpoint().catch((err) => {
            if (process.env.NODE_ENV !== "test") {
              console.warn("[CalibrationTracker] Checkpoint failed:", err instanceof Error ? err.message : String(err));
            }
          });
        }, this.intervalMs);
        if (this.timer && typeof this.timer.unref === "function") {
          this.timer.unref();
        }
      }
      // === Signal accumulation ===
      /** Record one conversational turn (human message + agent response). */
      recordTurn() {
        this.turnCount++;
      }
      /** Record that the developer redirected the agent from the original task. */
      recordScopeChange() {
        this.scopeChanged = true;
        this.redirectCount++;
      }
      /** Record a logical task boundary (agent worked on a new, separate task). */
      recordTaskBoundary() {
        this.distinctTaskCount++;
      }
      /** Set or update the total number of files modified. */
      recordFilesModified(count) {
        this.filesModified = count;
      }
      /** Set or update the total number of lines changed. */
      recordLinesChanged(count) {
        this.linesChanged = count;
      }
      /** Set or update the total tokens used. */
      recordTokensUsed(count) {
        this.tokensUsed = count;
      }
      /** Set or update the retry count. */
      recordRetry() {
        this.retryCount++;
      }
      /** Record whether tests passed. */
      recordTestResult(passed) {
        this.testsPassed = passed;
      }
      /** Record an error category for failed tasks. */
      recordError(category) {
        this.errorCategory = category;
      }
      /** Add arbitrary metadata. Merged with existing metadata. */
      addMetadata(data) {
        const safe = Object.keys(data).reduce((acc, key) => {
          if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
            acc[key] = data[key];
          }
          return acc;
        }, {});
        this.metadata = { ...this.metadata, ...safe };
      }
      // === Reporting ===
      /** Send a checkpoint report with current accumulated state. */
      async checkpoint() {
        if (!this.enabled || this.disposed)
          return null;
        const durationMinutes = Math.round((Date.now() - this.startedAt) / 6e4);
        return this.client.reportOutcome({
          proposalId: this.proposalId,
          outcome: "partially_completed",
          actualDurationMinutes: durationMinutes,
          filesModified: this.filesModified || void 0,
          linesChanged: this.linesChanged || void 0,
          tokensUsed: this.tokensUsed || void 0,
          retryCount: this.retryCount || void 0,
          turnCount: this.turnCount || void 0,
          scopeChanged: this.scopeChanged,
          redirectCount: this.redirectCount || void 0,
          distinctTaskCount: this.distinctTaskCount,
          errorCategory: this.errorCategory,
          testsPassed: this.testsPassed,
          metadata: Object.keys(this.metadata).length > 0 ? this.metadata : void 0
        });
      }
      /**
       * Send the final outcome report and stop the tracker.
       * Call this when the agent session ends (if you can catch the exit).
       */
      async complete(outcome, extras) {
        if (!this.enabled || this.disposed)
          return null;
        this.stopTimer();
        this.disposed = true;
        const durationMinutes = Math.round((Date.now() - this.startedAt) / 6e4);
        return this.client.reportOutcome({
          proposalId: this.proposalId,
          outcome,
          actualDurationMinutes: durationMinutes,
          filesModified: this.filesModified || void 0,
          linesChanged: this.linesChanged || void 0,
          tokensUsed: this.tokensUsed || void 0,
          retryCount: this.retryCount || void 0,
          turnCount: this.turnCount || void 0,
          scopeChanged: this.scopeChanged,
          redirectCount: this.redirectCount || void 0,
          distinctTaskCount: this.distinctTaskCount,
          errorCategory: this.errorCategory,
          testsPassed: this.testsPassed,
          metadata: Object.keys(this.metadata).length > 0 ? this.metadata : void 0,
          ...extras
        });
      }
      /** Stop the checkpoint timer and clean up. Does NOT send a final report. */
      dispose() {
        this.stopTimer();
        this.disposed = true;
      }
      /** Whether the tracker is still active. */
      get isActive() {
        return this.enabled && !this.disposed;
      }
      /** Current accumulated turn count. */
      get turns() {
        return this.turnCount;
      }
      stopTimer() {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
      }
    };
  }
});

// node_modules/@headsdown/sdk/dist/wrap-up.js
var init_wrap_up = __esm({
  "node_modules/@headsdown/sdk/dist/wrap-up.js"() {
  }
});

// node_modules/@headsdown/sdk/dist/execution-directive.js
function defaultRefreshAt(schedule, guidance) {
  if (!schedule && !guidance)
    return null;
  return schedule?.attentionDeadlineAt ?? guidance?.deadlineAt ?? schedule?.nextTransitionAt ?? null;
}
function availabilityDirective(mode) {
  if (mode === "offline") {
    return {
      directiveCode: "defer",
      reasonCode: "availability_offline",
      explanation: "The user is offline right now, so non-urgent work should be deferred.",
      maxScope: "minimal",
      avoidNewRefactors: true,
      requireHandoffIfIncomplete: true,
      prioritizeTests: "minimal"
    };
  }
  if (mode === "busy" || mode === "limited") {
    return {
      directiveCode: "proceed_with_caution",
      reasonCode: `availability_${mode}`,
      explanation: "The user is in a focused or limited state, so execution should stay narrow and completion-oriented.",
      maxScope: "minimal",
      avoidNewRefactors: true,
      requireHandoffIfIncomplete: true,
      prioritizeTests: mode === "limited" ? "minimal" : "standard"
    };
  }
  return {
    directiveCode: "proceed",
    reasonCode: "availability_online",
    explanation: "The user is available for normal progress.",
    maxScope: "normal",
    avoidNewRefactors: false,
    requireHandoffIfIncomplete: false,
    prioritizeTests: "standard"
  };
}
function directiveInstruction(directiveCode, maxScope) {
  if (directiveCode === "defer") {
    return "Execution policy: do not proceed with this work now. Defer or reduce scope until conditions change.";
  }
  if (maxScope === "full_depth") {
    return "Execution policy: proceed with full implementation depth, include robust validation and tests, and complete the requested outcome thoroughly.";
  }
  if (directiveCode === "proceed_with_caution") {
    return "Execution policy: proceed with caution, keep scope narrow, and optimize for safe completion of the current slice.";
  }
  return "Execution policy: proceed normally with the requested task outcome.";
}
function hasWrapUpBehavior(guidance) {
  if (!guidance)
    return false;
  return guidance.active || guidance.source === "forced_wrap_up" || guidance.source === "threshold";
}
function hasFullDepthBehavior(guidance) {
  if (!guidance)
    return false;
  return guidance.selectedMode === "full_depth" || guidance.source === "forced_full_depth";
}
function describeExecutionDirective(input) {
  const contract = input.contract ?? null;
  const schedule = input.schedule ?? null;
  const verdict = input.verdict ?? null;
  const mode = contract?.mode ?? null;
  const locked = contract?.lock === true;
  const wrapUpGuidance = verdict?.wrapUpGuidance ?? schedule?.wrapUpGuidance ?? null;
  const wrapUpMode = wrapUpGuidance?.selectedMode ?? "auto";
  const wrapUpSource = wrapUpGuidance?.source ?? null;
  const wrapUpActive = wrapUpGuidance?.active === true;
  const base = availabilityDirective(mode);
  let directiveCode = base.directiveCode;
  let enforcement = "soft";
  let reasonCode = base.reasonCode;
  let explanation = base.explanation;
  let maxScope = base.maxScope;
  let avoidNewRefactors = base.avoidNewRefactors;
  let requireHandoffIfIncomplete = base.requireHandoffIfIncomplete;
  let prioritizeTests = base.prioritizeTests;
  if (hasWrapUpBehavior(wrapUpGuidance)) {
    if (directiveCode === "proceed") {
      directiveCode = "proceed_with_caution";
    }
    reasonCode = wrapUpSource ?? "threshold";
    explanation = wrapUpGuidance?.reason || "Wrap-Up guidance is active, so execution should emphasize finishing current scope over starting new work.";
    maxScope = "minimal";
    avoidNewRefactors = true;
    requireHandoffIfIncomplete = true;
    prioritizeTests = "minimal";
  }
  if (hasFullDepthBehavior(wrapUpGuidance) && directiveCode !== "defer") {
    reasonCode = wrapUpSource ?? "forced_full_depth";
    explanation = wrapUpGuidance?.reason || "A full-depth override is active, so execution should prioritize complete implementation depth despite deadline proximity.";
    maxScope = "full_depth";
    avoidNewRefactors = false;
    requireHandoffIfIncomplete = true;
    prioritizeTests = "robust";
  }
  if (locked) {
    if (directiveCode === "proceed") {
      directiveCode = "proceed_with_caution";
    }
    reasonCode = "locked";
    explanation = "The user has locked status behavior. Large or risky changes require confirmation before proceeding.";
  }
  if (verdict?.decision === "deferred") {
    directiveCode = "defer";
    enforcement = "hard";
    reasonCode = "verdict_deferred";
    explanation = verdict.reason || "HeadsDown deferred this task under current conditions.";
  }
  if (verdict?.decision === "approved") {
    enforcement = "hard";
    explanation = verdict.reason || explanation;
  }
  const context = [];
  if (typeof wrapUpGuidance?.remainingMinutes === "number") {
    context.push(`About ${wrapUpGuidance.remainingMinutes} minutes remain before the next attention boundary.`);
  }
  if (wrapUpGuidance?.reason) {
    context.push(`Guidance reason: ${wrapUpGuidance.reason}`);
  }
  if (wrapUpGuidance?.hints?.length) {
    context.push(`Hints: ${wrapUpGuidance.hints.join("; ")}`);
  }
  const instructionParts = [
    directiveInstruction(directiveCode, maxScope),
    `Do not: ${avoidNewRefactors ? "start new refactors or expand scope unnecessarily" : "ignore required validation or quality checks"}.`,
    `Context: ${explanation}`,
    ...context
  ];
  return {
    directiveCode,
    primaryDirective: instructionParts.join(" "),
    enforcement,
    reasonCode,
    explanation,
    generatedAt: input.generatedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    refreshAt: defaultRefreshAt(schedule, wrapUpGuidance),
    summary: `${directiveCode.toUpperCase()} (${reasonCode})`,
    hardLimits: {
      requireConfirmationBeforeLargeChanges: locked,
      avoidNewRefactors,
      requireHandoffIfIncomplete,
      maxScope,
      prioritizeTests
    },
    supportingSignals: {
      availabilityMode: mode,
      locked,
      wrapUpMode,
      wrapUpSource,
      wrapUpActive,
      remainingMinutes: wrapUpGuidance?.remainingMinutes ?? null,
      verdictDecision: verdict?.decision ?? null,
      verdictReason: verdict?.reason ?? null,
      guidanceReason: wrapUpGuidance?.reason ?? null,
      hints: wrapUpGuidance?.hints ?? []
    }
  };
}
var init_execution_directive = __esm({
  "node_modules/@headsdown/sdk/dist/execution-directive.js"() {
  }
});

// node_modules/@headsdown/sdk/dist/referee/contract.js
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function parseCheckType(value, index) {
  if (typeof value !== "string")
    throw new LocalRefereeContractError(`check ${index + 1} is missing a string type.`);
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!CHECK_TYPES.has(normalized))
    throw new LocalRefereeContractError(`check ${index + 1} has unsupported type.`);
  return normalized;
}
function parseMax(value, index, field) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new LocalRefereeContractError(`check ${index + 1} requires a non-negative integer ${field}.`);
  return value;
}
function parseRequiredString(value, index, allowed) {
  if (typeof value !== "string")
    throw new LocalRefereeContractError(`check ${index + 1} requires a string required value.`);
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!allowed.includes(normalized))
    throw new LocalRefereeContractError(`check ${index + 1} has unsupported required value.`);
  return normalized;
}
function parseRequiredBoolean(value, index) {
  if (typeof value !== "boolean")
    throw new LocalRefereeContractError(`check ${index + 1} requires a boolean required value.`);
  return value;
}
function parseCheck(value, index) {
  const record = asRecord(value);
  if (!record)
    throw new LocalRefereeContractError(`check ${index + 1} must be an object.`);
  const type = parseCheckType(record.type, index);
  switch (type) {
    case "validation_status":
      return {
        type,
        required: parseRequiredString(record.required ?? "passed", index, [
          "passed",
          "failed",
          "unknown"
        ])
      };
    case "max_files_touched":
    case "max_tool_calls":
      return { type, max: parseMax(record.max, index, "max") };
    case "require_tests":
    case "git_commit_present":
      return { type, required: parseRequiredBoolean(record.required ?? true, index) };
    case "network_required":
      return { type, required: parseRequiredBoolean(record.required, index) };
    case "outcome":
      return {
        type,
        required: parseRequiredString(record.required ?? "completed", index, [
          "completed",
          "partially_completed",
          "blocked",
          "unknown"
        ])
      };
  }
}
function parseLocalRefereeContract(value) {
  const record = asRecord(value);
  if (!record)
    throw new LocalRefereeContractError("Local Referee contract must be a JSON object.");
  if (record.version !== 1)
    throw new LocalRefereeContractError("Local Referee contract version must be 1.");
  if (!Array.isArray(record.checks) || record.checks.length === 0)
    throw new LocalRefereeContractError("Local Referee contract requires at least one check.");
  return { version: 1, checks: record.checks.map((check, index) => parseCheck(check, index)) };
}
function parseLocalRefereeContractJson(contents) {
  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new LocalRefereeContractError("Local Referee contract must be valid JSON.");
  }
  return parseLocalRefereeContract(parsed);
}
var LOCAL_REFEREE_CONTRACT_PATH, CHECK_TYPES, LocalRefereeContractError;
var init_contract = __esm({
  "node_modules/@headsdown/sdk/dist/referee/contract.js"() {
    LOCAL_REFEREE_CONTRACT_PATH = ".headsdown/referee.json";
    CHECK_TYPES = /* @__PURE__ */ new Set([
      "validation_status",
      "max_files_touched",
      "max_tool_calls",
      "require_tests",
      "network_required",
      "outcome",
      "git_commit_present"
    ]);
    LocalRefereeContractError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "LocalRefereeContractError";
      }
    };
  }
});

// node_modules/@headsdown/sdk/dist/referee/evidence.js
function normalizeOptionalNonNegativeInteger(value) {
  if (value === void 0 || value === null || value === "")
    return null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed >= 0)
      return parsed;
  }
  return null;
}
function normalizeOptionalNonNegativeNumber(value) {
  if (value === void 0 || value === null || value === "")
    return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0)
      return parsed;
  }
  return null;
}
function normalizeCountEvidence(value) {
  const count = normalizeOptionalNonNegativeInteger(value);
  return count === null ? { count: 0, known: false } : { count, known: true };
}
function normalizeOptionalMinutes(value) {
  return normalizeOptionalNonNegativeNumber(value);
}
function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 1)
      return true;
    if (value === 0)
      return false;
    return fallback;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "y", "1", "passed", "run", "present", "committed"].includes(normalized))
      return true;
    if (["false", "no", "n", "0", "failed", "none", "missing", "absent"].includes(normalized))
      return false;
  }
  return fallback;
}
function normalizeValidationStatus(value) {
  if (typeof value !== "string")
    return "unknown";
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["passed", "pass", "success", "succeeded", "ok", "green"].includes(normalized))
    return "passed";
  if (["failed", "fail", "failure", "error", "red"].includes(normalized))
    return "failed";
  return "unknown";
}
function normalizeOutcome(value) {
  if (typeof value !== "string")
    return "unknown";
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["completed", "complete", "succeeded", "success"].includes(normalized))
    return "completed";
  if (["partially_completed", "partial", "paused", "needs_review"].includes(normalized))
    return "partially_completed";
  if (["blocked", "deferred", "stopped"].includes(normalized))
    return "blocked";
  return "unknown";
}
function bucketCount(count) {
  if (!Number.isSafeInteger(count) || count < 0)
    return "unknown";
  if (count === 0)
    return "0";
  if (count <= 2)
    return "1_to_2";
  if (count <= 5)
    return "3_to_5";
  if (count <= 10)
    return "6_to_10";
  return "over_10";
}
function bucketMinutes(minutes) {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0)
    return "unknown";
  if (minutes < 15)
    return "under_15";
  if (minutes <= 30)
    return "15_to_30";
  if (minutes <= 60)
    return "30_to_60";
  if (minutes <= 120)
    return "60_to_120";
  return "over_120";
}
function normalizeLocalRefereeEvidence(raw = {}) {
  const filesTouched = normalizeCountEvidence(raw.filesTouched);
  const toolCalls = normalizeCountEvidence(raw.toolCalls);
  const elapsedMinutes = normalizeOptionalMinutes(raw.elapsedMinutes);
  return {
    filesTouched: filesTouched.count,
    filesTouchedKnown: filesTouched.known,
    filesTouchedBucket: filesTouched.known ? bucketCount(filesTouched.count) : "unknown",
    toolCalls: toolCalls.count,
    toolCallsKnown: toolCalls.known,
    toolCallsBucket: toolCalls.known ? bucketCount(toolCalls.count) : "unknown",
    validationStatus: normalizeValidationStatus(raw.validationStatus),
    testsRun: normalizeBoolean(raw.testsRun),
    networkRequired: normalizeBoolean(raw.networkRequired),
    gitCommitPresent: normalizeBoolean(raw.gitCommitPresent),
    elapsedMinutes,
    elapsedMinutesBucket: bucketMinutes(elapsedMinutes),
    manualReviewRoundTripsAvoided: normalizeOptionalNonNegativeInteger(raw.manualReviewRoundTripsAvoided),
    outcome: normalizeOutcome(raw.outcome)
  };
}
var init_evidence = __esm({
  "node_modules/@headsdown/sdk/dist/referee/evidence.js"() {
  }
});

// node_modules/@headsdown/sdk/dist/referee/evaluate.js
function result(index, check, passed, reasonCode) {
  return {
    id: `check_${index + 1}`,
    type: check.type,
    status: passed ? "passed" : "failed",
    reasonCode
  };
}
function evaluateCheck(check, evidence, index) {
  switch (check.type) {
    case "validation_status": {
      const required = String(check.required ?? "passed");
      return result(index, check, evidence.validationStatus === required, evidence.validationStatus === required ? "validation_status_matched" : "validation_status_mismatch");
    }
    case "max_files_touched": {
      const max = check.max ?? 0;
      if (!evidence.filesTouchedKnown)
        return result(index, check, false, "files_touched_unknown");
      return result(index, check, evidence.filesTouched <= max, evidence.filesTouched <= max ? "files_within_limit" : "files_over_limit");
    }
    case "max_tool_calls": {
      const max = check.max ?? 0;
      if (!evidence.toolCallsKnown)
        return result(index, check, false, "tool_calls_unknown");
      return result(index, check, evidence.toolCalls <= max, evidence.toolCalls <= max ? "tool_calls_within_limit" : "tool_calls_over_limit");
    }
    case "require_tests": {
      const required = check.required === true;
      return result(index, check, evidence.testsRun === required, evidence.testsRun === required ? "tests_requirement_matched" : "tests_requirement_mismatch");
    }
    case "network_required": {
      const required = check.required === true;
      return result(index, check, evidence.networkRequired === required, evidence.networkRequired === required ? "network_requirement_matched" : "network_requirement_mismatch");
    }
    case "outcome": {
      const required = String(check.required ?? "completed");
      return result(index, check, evidence.outcome === required, evidence.outcome === required ? "outcome_matched" : "outcome_mismatch");
    }
    case "git_commit_present": {
      const required = check.required === true;
      return result(index, check, evidence.gitCommitPresent === required, evidence.gitCommitPresent === required ? "git_commit_requirement_matched" : "git_commit_requirement_mismatch");
    }
  }
}
function evaluateLocalRefereeContract(contract, evidence) {
  const normalizedContract = parseLocalRefereeContract(contract);
  const checks = normalizedContract.checks.map((check, index) => evaluateCheck(check, evidence, index));
  return {
    verdict: checks.every((check) => check.status === "passed") ? "passed" : "needs_review",
    checks
  };
}
var init_evaluate = __esm({
  "node_modules/@headsdown/sdk/dist/referee/evaluate.js"() {
    init_contract();
  }
});

// node_modules/@headsdown/sdk/dist/referee/labels.js
function labelLocalRefereeCheckType(type) {
  const label = LOCAL_REFEREE_CHECK_LABELS[type];
  if (!label)
    throw new Error(`Unsupported Local Referee check type: ${String(type)}.`);
  return label;
}
var LOCAL_REFEREE_CHECK_LABELS;
var init_labels = __esm({
  "node_modules/@headsdown/sdk/dist/referee/labels.js"() {
    LOCAL_REFEREE_CHECK_LABELS = {
      validation_status: "Validation completed",
      max_files_touched: "Scope within contract",
      max_tool_calls: "Scope within contract",
      require_tests: "Validation completed",
      network_required: "Network requirement satisfied",
      outcome: "Definition of done satisfied",
      git_commit_present: "Commit present"
    };
  }
});

// node_modules/@headsdown/sdk/dist/referee/receipt.js
import { createHash } from "node:crypto";
function buildLocalRefereeContractRef(contract) {
  const normalized = parseLocalRefereeContract(contract);
  const digest = createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
  return `contract_${digest}`;
}
function asRecord2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function assertExactKeys(record, allowed, path) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key))
      throw new Error(`Local Referee receipt contains unsupported field '${key}' at ${path}.`);
  }
}
function assertSafeToken(value, path) {
  if (typeof value !== "string" || !RECEIPT_SAFE_TOKEN_PATTERN.test(value) || value.includes("://") || value.toLowerCase().includes(".git")) {
    throw new Error(`Local Referee receipt requires a safe token at ${path}.`);
  }
}
function assertIsoTimestamp(value, path) {
  assertSafeToken(value, path);
  const normalizedValue = value.includes(".") ? value : value.replace("Z", ".000Z");
  const parsed = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString() !== normalizedValue) {
    throw new Error(`Local Referee receipt requires an ISO timestamp at ${path}.`);
  }
}
function assertContractRef(value, path) {
  assertSafeToken(value, path);
  if (!/^contract_[a-f0-9]{16}$/.test(value)) {
    throw new Error(`Local Referee receipt requires a contract ref at ${path}.`);
  }
}
function assertCheckId(value, path) {
  assertSafeToken(value, path);
  if (!/^check_\d+$/.test(value)) {
    throw new Error(`Local Referee receipt requires a check id at ${path}.`);
  }
}
function assertEnum(value, allowed, path) {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`Local Referee receipt contains unsupported value at ${path}.`);
  }
}
function assertBoolean(value, path) {
  if (typeof value !== "boolean")
    throw new Error(`Local Referee receipt requires a boolean at ${path}.`);
}
function assertOptionalNonNegativeInteger(value, path) {
  if (value !== void 0 && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`Local Referee receipt requires a non-negative integer at ${path}.`);
  }
}
function assertCheckReasonCode(type, status2, value, path) {
  assertSafeToken(value, path);
  if (!RECEIPT_REASON_CODES[type][status2].has(value)) {
    throw new Error(`Local Referee receipt contains unsupported reason code at ${path}.`);
  }
}
function assertLocalRefereeReceipt(value) {
  const receipt = asRecord2(value);
  if (!receipt)
    throw new Error("Local Referee receipt must be an object.");
  assertExactKeys(receipt, RECEIPT_KEYS, "receipt");
  if (receipt.schemaVersion !== 1)
    throw new Error("Local Referee receipt schemaVersion must be 1.");
  assertIsoTimestamp(receipt.generatedAt, "receipt.generatedAt");
  assertContractRef(receipt.contractRef, "receipt.contractRef");
  assertEnum(receipt.verdict, RECEIPT_VERDICTS, "receipt.verdict");
  const evidence = asRecord2(receipt.evidence);
  if (!evidence)
    throw new Error("Local Referee receipt evidence must be an object.");
  assertExactKeys(evidence, RECEIPT_EVIDENCE_KEYS, "receipt.evidence");
  assertEnum(evidence.filesTouchedBucket, RECEIPT_COUNT_BUCKETS, "receipt.evidence.filesTouchedBucket");
  assertEnum(evidence.toolCallsBucket, RECEIPT_COUNT_BUCKETS, "receipt.evidence.toolCallsBucket");
  assertEnum(evidence.validationStatus, RECEIPT_VALIDATION_STATUSES, "receipt.evidence.validationStatus");
  assertBoolean(evidence.testsRun, "receipt.evidence.testsRun");
  assertBoolean(evidence.networkRequired, "receipt.evidence.networkRequired");
  if (evidence.gitCommitPresent !== void 0)
    assertBoolean(evidence.gitCommitPresent, "receipt.evidence.gitCommitPresent");
  assertEnum(evidence.elapsedMinutesBucket, RECEIPT_TIME_BUCKETS, "receipt.evidence.elapsedMinutesBucket");
  assertOptionalNonNegativeInteger(evidence.manualReviewRoundTripsAvoided, "receipt.evidence.manualReviewRoundTripsAvoided");
  assertEnum(evidence.outcome, RECEIPT_OUTCOMES, "receipt.evidence.outcome");
  if (!Array.isArray(receipt.checks))
    throw new Error("Local Referee receipt checks must be an array.");
  if (receipt.checks.length === 0)
    throw new Error("Local Referee receipt requires at least one check.");
  let failedCheckCount = 0;
  let hasGitCommitCheck = false;
  for (const [index, value2] of receipt.checks.entries()) {
    const check = asRecord2(value2);
    if (!check)
      throw new Error(`Local Referee receipt check ${index + 1} must be an object.`);
    assertExactKeys(check, RECEIPT_CHECK_KEYS, `receipt.checks[${index}]`);
    assertCheckId(check.id, `receipt.checks[${index}].id`);
    if (check.id !== `check_${index + 1}`) {
      throw new Error(`Local Referee receipt requires sequential check ids at receipt.checks[${index}].id.`);
    }
    assertEnum(check.type, RECEIPT_CHECK_TYPES, `receipt.checks[${index}].type`);
    assertEnum(check.status, RECEIPT_STATUSES, `receipt.checks[${index}].status`);
    assertCheckReasonCode(check.type, check.status, check.reasonCode, `receipt.checks[${index}].reasonCode`);
    if (check.status === "failed")
      failedCheckCount += 1;
    if (check.type === "git_commit_present")
      hasGitCommitCheck = true;
  }
  if (receipt.verdict === "passed" && failedCheckCount > 0)
    throw new Error("Local Referee receipt verdict does not match failed checks.");
  if (receipt.verdict === "needs_review" && failedCheckCount === 0)
    throw new Error("Local Referee receipt verdict does not match passed checks.");
  if (hasGitCommitCheck && evidence.gitCommitPresent === void 0)
    throw new Error("Local Referee receipt gitCommitPresent evidence must match checks.");
  if (!hasGitCommitCheck && evidence.gitCommitPresent !== void 0)
    throw new Error("Local Referee receipt gitCommitPresent evidence must match checks.");
}
function assertEvaluationMatchesContract(evaluation, contract, evidence) {
  const expected = evaluateLocalRefereeContract(contract, evidence);
  if (evaluation.verdict !== expected.verdict || evaluation.checks.length !== expected.checks.length) {
    throw new Error("Local Referee evaluation does not match contract checks.");
  }
  for (const [index, check] of evaluation.checks.entries()) {
    const expectedCheck = expected.checks[index];
    if (!expectedCheck || check.id !== expectedCheck.id || check.type !== expectedCheck.type || check.status !== expectedCheck.status || check.reasonCode !== expectedCheck.reasonCode) {
      throw new Error("Local Referee evaluation does not match contract checks.");
    }
  }
}
function buildLocalRefereeReceipt(input) {
  const contract = parseLocalRefereeContract(input.contract);
  assertEvaluationMatchesContract(input.evaluation, contract, input.evidence);
  const hasGitCommitCheck = contract.checks.some((check) => check.type === "git_commit_present");
  const manualReviewRoundTripsAvoided = input.evidence.manualReviewRoundTripsAvoided;
  const receipt = {
    schemaVersion: 1,
    generatedAt: (input.now ?? /* @__PURE__ */ new Date()).toISOString(),
    contractRef: buildLocalRefereeContractRef(contract),
    verdict: input.evaluation.verdict,
    evidence: {
      filesTouchedBucket: input.evidence.filesTouchedBucket,
      toolCallsBucket: input.evidence.toolCallsBucket,
      validationStatus: input.evidence.validationStatus,
      testsRun: input.evidence.testsRun,
      networkRequired: input.evidence.networkRequired,
      ...hasGitCommitCheck ? { gitCommitPresent: input.evidence.gitCommitPresent } : {},
      elapsedMinutesBucket: input.evidence.elapsedMinutesBucket,
      ...manualReviewRoundTripsAvoided === null ? {} : { manualReviewRoundTripsAvoided },
      outcome: input.evidence.outcome
    },
    checks: input.evaluation.checks
  };
  assertLocalRefereeReceipt(receipt);
  return receipt;
}
function markdownCheckLines(receipt) {
  const lines = [];
  for (const check of receipt.checks) {
    const label = labelLocalRefereeCheckType(check.type);
    const order = MARKDOWN_CHECK_ORDER.get(check.type) ?? Number.MAX_SAFE_INTEGER;
    const existing = lines.find((line) => line.label === label);
    if (!existing) {
      lines.push({ label, status: check.status, order });
      continue;
    }
    existing.order = Math.min(existing.order, order);
    if (check.status === "failed")
      existing.status = "failed";
  }
  return lines.sort((left, right) => left.order - right.order);
}
function renderLocalRefereeReceiptMarkdown(receipt) {
  assertLocalRefereeReceipt(receipt);
  const lines = ["### HeadsDown Referee", ""];
  for (const check of markdownCheckLines(receipt)) {
    lines.push(`${check.status === "passed" ? "\u2713" : "\u21A9"} ${check.label}`);
  }
  if (receipt.evidence.manualReviewRoundTripsAvoided !== void 0) {
    lines.push(`\u21A9 Manual review round trips avoided: ${receipt.evidence.manualReviewRoundTripsAvoided}`);
  }
  lines.push("\u{1F512} Verified locally");
  return lines.join("\n");
}
var RECEIPT_KEYS, RECEIPT_EVIDENCE_KEYS, RECEIPT_CHECK_KEYS, RECEIPT_VERDICTS, RECEIPT_STATUSES, RECEIPT_CHECK_TYPES, RECEIPT_VALIDATION_STATUSES, RECEIPT_OUTCOMES, RECEIPT_COUNT_BUCKETS, RECEIPT_REASON_CODES, RECEIPT_TIME_BUCKETS, RECEIPT_SAFE_TOKEN_PATTERN, MARKDOWN_CHECK_ORDER;
var init_receipt = __esm({
  "node_modules/@headsdown/sdk/dist/referee/receipt.js"() {
    init_contract();
    init_evaluate();
    init_labels();
    RECEIPT_KEYS = /* @__PURE__ */ new Set([
      "schemaVersion",
      "generatedAt",
      "contractRef",
      "verdict",
      "evidence",
      "checks"
    ]);
    RECEIPT_EVIDENCE_KEYS = /* @__PURE__ */ new Set([
      "filesTouchedBucket",
      "toolCallsBucket",
      "validationStatus",
      "testsRun",
      "networkRequired",
      "gitCommitPresent",
      "elapsedMinutesBucket",
      "manualReviewRoundTripsAvoided",
      "outcome"
    ]);
    RECEIPT_CHECK_KEYS = /* @__PURE__ */ new Set(["id", "type", "status", "reasonCode"]);
    RECEIPT_VERDICTS = /* @__PURE__ */ new Set(["passed", "needs_review"]);
    RECEIPT_STATUSES = /* @__PURE__ */ new Set(["passed", "failed"]);
    RECEIPT_CHECK_TYPES = new Set(Object.keys(LOCAL_REFEREE_CHECK_LABELS));
    RECEIPT_VALIDATION_STATUSES = /* @__PURE__ */ new Set(["passed", "failed", "unknown"]);
    RECEIPT_OUTCOMES = /* @__PURE__ */ new Set(["completed", "partially_completed", "blocked", "unknown"]);
    RECEIPT_COUNT_BUCKETS = /* @__PURE__ */ new Set(["0", "1_to_2", "3_to_5", "6_to_10", "over_10", "unknown"]);
    RECEIPT_REASON_CODES = {
      validation_status: {
        passed: /* @__PURE__ */ new Set(["validation_status_matched"]),
        failed: /* @__PURE__ */ new Set(["validation_status_mismatch"])
      },
      max_files_touched: {
        passed: /* @__PURE__ */ new Set(["files_within_limit"]),
        failed: /* @__PURE__ */ new Set(["files_over_limit", "files_touched_unknown"])
      },
      max_tool_calls: {
        passed: /* @__PURE__ */ new Set(["tool_calls_within_limit"]),
        failed: /* @__PURE__ */ new Set(["tool_calls_over_limit", "tool_calls_unknown"])
      },
      require_tests: {
        passed: /* @__PURE__ */ new Set(["tests_requirement_matched"]),
        failed: /* @__PURE__ */ new Set(["tests_requirement_mismatch"])
      },
      network_required: {
        passed: /* @__PURE__ */ new Set(["network_requirement_matched"]),
        failed: /* @__PURE__ */ new Set(["network_requirement_mismatch"])
      },
      outcome: {
        passed: /* @__PURE__ */ new Set(["outcome_matched"]),
        failed: /* @__PURE__ */ new Set(["outcome_mismatch"])
      },
      git_commit_present: {
        passed: /* @__PURE__ */ new Set(["git_commit_requirement_matched"]),
        failed: /* @__PURE__ */ new Set(["git_commit_requirement_mismatch"])
      }
    };
    RECEIPT_TIME_BUCKETS = /* @__PURE__ */ new Set([
      "under_15",
      "15_to_30",
      "30_to_60",
      "60_to_120",
      "over_120",
      "unknown"
    ]);
    RECEIPT_SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_.:-]{1,256}$/;
    MARKDOWN_CHECK_ORDER = /* @__PURE__ */ new Map([
      ["outcome", 0],
      ["validation_status", 1],
      ["require_tests", 1],
      ["git_commit_present", 2],
      ["max_files_touched", 3],
      ["max_tool_calls", 3],
      ["network_required", 4]
    ]);
  }
});

// node_modules/@headsdown/sdk/dist/referee/outcome-payload.js
var PROHIBITED_KEYS2, PROHIBITED_COMPACT_KEYS2;
var init_outcome_payload = __esm({
  "node_modules/@headsdown/sdk/dist/referee/outcome-payload.js"() {
    init_receipt();
    PROHIBITED_KEYS2 = /* @__PURE__ */ new Set([
      "prompt",
      "prompts",
      "source_code",
      "code",
      "diff",
      "patch",
      "file",
      "files",
      "file_path",
      "path",
      "repo",
      "repository",
      "branch",
      "terminal",
      "stdout",
      "stderr",
      "output",
      "log",
      "logs",
      "issue_body",
      "pr_body",
      "ticket_body",
      "url",
      "message",
      "content",
      "contents",
      "hash",
      "secret",
      "secrets",
      "token",
      "tokens",
      "access_token",
      "access_tokens",
      "refresh_token",
      "refresh_tokens",
      "api_key",
      "api_keys",
      "password",
      "cookie",
      "environment",
      "environment_variable",
      "environment_variables",
      "env_var",
      "env_vars"
    ]);
    PROHIBITED_COMPACT_KEYS2 = new Set(Array.from(PROHIBITED_KEYS2, (key) => key.replace(/_/g, "")));
  }
});

// node_modules/@headsdown/sdk/dist/referee/outcome-preview.js
var init_outcome_preview = __esm({
  "node_modules/@headsdown/sdk/dist/referee/outcome-preview.js"() {
    init_outcome_payload();
  }
});

// node_modules/@headsdown/sdk/dist/referee/share-decision.js
var init_share_decision = __esm({
  "node_modules/@headsdown/sdk/dist/referee/share-decision.js"() {
  }
});

// node_modules/@headsdown/sdk/dist/referee/submit.js
var init_submit = __esm({
  "node_modules/@headsdown/sdk/dist/referee/submit.js"() {
    init_errors();
    init_outcome_payload();
  }
});

// node_modules/@headsdown/sdk/dist/referee/index.js
var init_referee = __esm({
  "node_modules/@headsdown/sdk/dist/referee/index.js"() {
    init_contract();
    init_evidence();
    init_evaluate();
    init_labels();
    init_receipt();
    init_outcome_payload();
    init_outcome_preview();
    init_share_decision();
    init_submit();
  }
});

// node_modules/@headsdown/sdk/dist/types.js
var HEADSDOWN_CALL_KEYS, HEADSDOWN_ACTION_KEYS;
var init_types = __esm({
  "node_modules/@headsdown/sdk/dist/types.js"() {
    HEADSDOWN_CALL_KEYS = [
      "good_to_run",
      "keep_it_tight",
      "attention_window_closing",
      "not_worth_starting_now",
      "off_the_clock",
      "finish_line_friction",
      "rabbit_hole_detected",
      "ready_to_resume",
      "all_contained",
      "needs_your_yes"
    ];
    HEADSDOWN_ACTION_KEYS = [
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
      "keep_queued"
    ];
  }
});

// node_modules/@headsdown/sdk/dist/agent-control.js
function hasAnySignal(reasonCodes, signals) {
  return reasonCodes.some((reasonCode) => signals.some((signal) => reasonCode.toLowerCase().includes(signal)));
}
function localCallKey(value) {
  return typeof value === "string" && HEADSDOWN_CALL_KEYS.includes(value);
}
function localActionKey(value) {
  return typeof value === "string" && HEADSDOWN_ACTION_KEYS.includes(value);
}
function knownAction(call) {
  if (localActionKey(call.primaryActionKnownKey) && call.allowedActionKnownKeys.includes(call.primaryActionKnownKey)) {
    return call.primaryActionKnownKey;
  }
  if (localActionKey(call.recommendedActionKnownKey) && call.allowedActionKnownKeys.includes(call.recommendedActionKnownKey)) {
    return call.recommendedActionKnownKey;
  }
  return null;
}
function knownSecondaryAction(call) {
  if (localActionKey(call.secondaryActionKnownKey) && call.allowedActionKnownKeys.includes(call.secondaryActionKnownKey)) {
    return call.secondaryActionKnownKey;
  }
  return null;
}
function safestAction(call) {
  return SAFE_ACTION_ORDER.find((actionKey) => call.allowedActionKnownKeys.includes(actionKey)) ?? null;
}
function fallbackKey(call) {
  if (localCallKey(call.knownKey))
    return { effectiveKey: call.knownKey, reason: "known_key" };
  if (call.severity === "action_required" || call.severity === "critical" || call.severity === "boundary" || call.urgency === "high" || call.allowedUiIntents.includes("review_request") || hasAnySignal(call.reasonCodes, HUMAN_DECISION_SIGNALS)) {
    return { effectiveKey: "needs_your_yes", reason: "human_decision_signal" };
  }
  const hasExplicitContainedSignals = CONTAINED_SIGNALS.every((signal) => call.reasonCodes.some((reasonCode) => reasonCode.toLowerCase().includes(signal)));
  if (hasExplicitContainedSignals) {
    if (call.allowedActionKeys.length === 0 && call.allowedActionKnownKeys.length === 0 && !call.allowedUiIntents.includes("review_request")) {
      return { effectiveKey: "all_contained", reason: "all_contained_signal" };
    }
    return { effectiveKey: "needs_your_yes", reason: "safe_default" };
  }
  if (call.severity === "caution" || call.confidence !== "exact" || hasAnySignal(call.reasonCodes, KEEP_TIGHT_SIGNALS)) {
    return { effectiveKey: "keep_it_tight", reason: "keep_tight_signal" };
  }
  return { effectiveKey: "needs_your_yes", reason: "safe_default" };
}
function fallbackTitle(key, title) {
  if (title.trim().length > 0)
    return title;
  if (key === "keep_it_tight")
    return "Keep it tight";
  if (key === "all_contained")
    return "All contained";
  return "Needs your yes";
}
function fallbackBody(key, body) {
  if (body.trim().length > 0)
    return body;
  if (key === "keep_it_tight") {
    return "HeadsDown needs the agent to stay inside a tighter slice before continuing.";
  }
  if (key === "all_contained") {
    return "Runs are staying inside your time, scope, and interruption limits. Nothing needs you right now.";
  }
  return "HeadsDown needs a human decision before this agent continues.";
}
function resolvedPrimaryActionIntent(call, resolved, primaryAction) {
  if (!primaryAction) {
    return resolved.effectiveKey === "needs_your_yes" ? "review_request" : "view_details";
  }
  if (resolved.reason === "known_key" && call.primaryActionKnownKey === primaryAction) {
    return call.primaryActionIntent;
  }
  return "none";
}
function resolveHeadsDownCallFallback(call) {
  const resolved = fallbackKey(call);
  const primaryAction = resolved.reason === "known_key" ? knownAction(call) : safestAction(call);
  const secondaryAction = resolved.reason === "known_key" ? knownSecondaryAction(call) : null;
  return {
    effectiveKey: resolved.effectiveKey,
    originalKey: call.key,
    unknownKey: resolved.reason === "known_key" ? null : call.key,
    title: fallbackTitle(resolved.effectiveKey, call.title),
    body: fallbackBody(resolved.effectiveKey, call.body),
    primaryActionKey: primaryAction,
    primaryActionIntent: resolvedPrimaryActionIntent(call, resolved, primaryAction),
    secondaryActionKey: secondaryAction,
    secondaryActionIntent: resolved.reason === "known_key" ? call.secondaryActionIntent : "view_details",
    reason: resolved.reason
  };
}
var SAFE_ACTION_ORDER, HUMAN_DECISION_SIGNALS, KEEP_TIGHT_SIGNALS, CONTAINED_SIGNALS;
var init_agent_control = __esm({
  "node_modules/@headsdown/sdk/dist/agent-control.js"() {
    init_types();
    SAFE_ACTION_ORDER = [
      "keep_queued",
      "pause_and_summarize",
      "queue_for_later",
      "stop_run"
    ];
    HUMAN_DECISION_SIGNALS = [
      "approval",
      "approve",
      "risk",
      "risky",
      "boundary",
      "spend",
      "external",
      "side_effect",
      "escalation",
      "human_decision",
      "needs_your_yes"
    ];
    KEEP_TIGHT_SIGNALS = [
      "limit",
      "limited",
      "low_confidence",
      "short",
      "scope",
      "validation",
      "uncertain",
      "tool_budget",
      "timebox"
    ];
    CONTAINED_SIGNALS = [
      "no_action_needed",
      "runs_within_bounds",
      "zero_pending_asks",
      "limits_holding"
    ];
  }
});

// node_modules/@headsdown/sdk/dist/autopilot-classifier.js
function severityIndex(severity) {
  return SEVERITY_ORDER.indexOf(severity);
}
function parseVersionParts(version) {
  const match = version.trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match)
    return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3] ?? "0", 10)
  };
}
function clampStepOrder(steps) {
  const unique = /* @__PURE__ */ new Set();
  for (const step of steps)
    unique.add(step);
  return [...unique];
}
function hasPlausibleSideEffects(action) {
  return action.external_side_effect === true || action.destructive === true || action.public_facing === true;
}
function isBashActionShape(action) {
  return action.tool_kind === "bash" && typeof action.command === "string";
}
function isEditActionShape(action) {
  return action.tool_kind === "edit" && typeof action.operation === "string";
}
function isWebfetchActionShape(action) {
  return action.tool_kind === "webfetch" && typeof action.url === "string";
}
function isMcpActionShape(action) {
  return action.tool_kind === "mcp" && typeof action.tool === "string";
}
function isComputerUseActionShape(action) {
  return action.tool_kind === "computer_use" && typeof action.action === "string";
}
function isInteractionAskUserActionShape(action) {
  return action.tool_kind === "interaction.ask_user" && isQuestionCategory(action.question_category) && isRecentToolContext(action.recent_tool_context);
}
function isQuestionCategory(value) {
  return typeof value === "string" && QUESTION_CATEGORIES.includes(value);
}
function isKnownToolKind(value) {
  return typeof value === "string" && KNOWN_TOOL_KINDS.includes(value);
}
function isRecentToolContext(value) {
  if (typeof value !== "object" || value === null)
    return false;
  const context = value;
  const turnsSince = context.turns_since;
  if (!Number.isInteger(turnsSince) || turnsSince === void 0 || turnsSince < 0)
    return false;
  if (context.last_tool_kind === "none")
    return context.last_tool_outcome === "unavailable";
  if (!isKnownToolKind(context.last_tool_kind))
    return false;
  return context.last_tool_outcome === "succeeded" || context.last_tool_outcome === "failed";
}
function isValidSandboxSnapshot(capabilities) {
  if (capabilities.stale)
    return false;
  if (!capabilities.capturedAt.trim())
    return false;
  if (capabilities.sandbox.available === false)
    return false;
  if (capabilities.sandbox.fsIsolation === "none")
    return false;
  if (capabilities.sandbox.identityIsolation === "none")
    return false;
  return true;
}
function supportsSandboxForToolKind(capabilities, toolKind) {
  const toolKindSupported = capabilities.toolKinds.includes(toolKind);
  if (!toolKindSupported)
    return false;
  const modes = capabilities.sandbox.modes ?? [];
  if (modes.includes("full_session"))
    return true;
  if (toolKind === "bash")
    return modes.includes("bash");
  if (toolKind === "edit")
    return modes.includes("edit_only");
  if (toolKind === "webfetch")
    return modes.includes("webfetch_only");
  return false;
}
function materialSteps(strategy, sandboxUsable) {
  const filtered = strategy.filter((step) => {
    if (step !== "try_in_sandbox")
      return true;
    return sandboxUsable;
  });
  return filtered.length > 0 ? filtered : ["defer_for_human_review"];
}
function prioritizeSandboxStep(steps, sandboxUsable) {
  if (!sandboxUsable)
    return steps;
  const withoutSandbox = steps.filter((step) => step !== "try_in_sandbox");
  return ["try_in_sandbox", ...withoutSandbox];
}
function evaluateClassifierVersionCompatibility(params) {
  const sdk = parseVersionParts(params.sdkVersion);
  const policy = parseVersionParts(params.policyVersion);
  if (!sdk || !policy) {
    return {
      level: "error",
      direction: "major_mismatch",
      message: "Classifier version format is invalid. Fallback to lockdown behavior.",
      shouldProceed: false,
      fallbackLatitude: "lockdown"
    };
  }
  if (sdk.major !== policy.major) {
    return {
      level: "error",
      direction: "major_mismatch",
      message: `Classifier major version mismatch (sdk=${params.sdkVersion}, policy=${params.policyVersion}). Fallback to lockdown behavior.`,
      shouldProceed: false,
      fallbackLatitude: "lockdown"
    };
  }
  if (policy.minor > sdk.minor) {
    return {
      level: "warning",
      direction: "backend_ahead",
      message: `Policy classifier version is ahead of SDK (sdk=${params.sdkVersion}, policy=${params.policyVersion}). Proceeding with known fields only.`,
      shouldProceed: true,
      fallbackLatitude: null
    };
  }
  if (sdk.minor > policy.minor) {
    return {
      level: "error",
      direction: "sdk_ahead",
      message: `SDK classifier version is ahead of policy version (sdk=${params.sdkVersion}, policy=${params.policyVersion}). Fallback to lockdown behavior.`,
      shouldProceed: false,
      fallbackLatitude: "lockdown"
    };
  }
  return {
    level: "none",
    direction: "match",
    message: "Classifier version match.",
    shouldProceed: true,
    fallbackLatitude: null
  };
}
function buildClassifierPromptFragments(input) {
  const rules = input.houseRules?.length ? input.houseRules.join(", ") : "none";
  const identityOverrides = input.identityActionOverrides?.length ? input.identityActionOverrides.join(", ") : "none";
  const taxonomyLines = SEVERITY_ORDER.map((severity) => {
    const tier = SEVERITY_TAXONOMY[severity];
    return `- Tier ${tier.tier} (${tier.label} / ${severity}): ${tier.profile}. Criteria: ${tier.criteria.join("; ")}. Examples: ${tier.examples.join(", ")}.`;
  }).join("\n");
  const fixtureLines = CLASSIFIER_FIXTURES.map((fixture) => `- ${fixture.action} => ${fixture.expected}`).join("\n");
  const taxonomyFragment = [
    "Severity taxonomy:",
    taxonomyLines,
    "",
    "Reference fixtures:",
    fixtureLines
  ].join("\n");
  const policyFragment = [
    `Latitude: ${input.latitude}`,
    `Max severity attemptable: ${LATITUDE_MAX_SEVERITY[input.latitude]}`,
    `Identity-action overrides: ${identityOverrides}`,
    `Enumerated house rules: ${rules}`
  ].join("\n");
  const outputSchemaFragment = [
    "Output JSON only:",
    '{"classification":"trivial|routine|notable|permanent|critical|classification_failed","confidence":"low|medium|high","reason_code":"sdk_enum"}'
  ].join("\n");
  const instructionsFragment = [
    "Classify the imminent action against the taxonomy.",
    "Never downgrade deterministic Critical findings.",
    "If the variant is unknown and side effects are plausible, return classification_failed.",
    "classification_failed bypasses latitude and must defer for human review.",
    "Return one of the allowed classification values only.",
    "When ending a turn to ask the user a question, construct an interaction.ask_user action shape rather than leaving the turn unclassified."
  ].join("\n");
  const fullSystemAddendum = [
    "Autopilot classifier addendum:",
    taxonomyFragment,
    "",
    policyFragment,
    "",
    instructionsFragment,
    "",
    outputSchemaFragment
  ].join("\n");
  return {
    taxonomyFragment,
    policyFragment,
    outputSchemaFragment,
    instructionsFragment,
    fullSystemAddendum
  };
}
function classifyActionShapeFallback(action) {
  if (action.tool_kind === "interaction.ask_user") {
    if (!isInteractionAskUserActionShape(action)) {
      return {
        outcome: "classification_failed",
        reasonCode: "malformed_ask_user_action_shape",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    const { question_category, recent_tool_context } = action;
    if (recent_tool_context.last_tool_outcome === "failed" && question_category === "recovery_decision") {
      return {
        outcome: "permanent",
        reasonCode: "ask_user_recovery_after_failure",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    if (question_category === "tooling_choice" && recent_tool_context.last_tool_outcome === "succeeded") {
      return {
        outcome: "routine",
        reasonCode: "ask_user_tooling_choice",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    return {
      outcome: "notable",
      reasonCode: "ask_user_baseline",
      source: "deterministic",
      toolKind: action.tool_kind
    };
  }
  if (!KNOWN_TOOL_KINDS.includes(action.tool_kind)) {
    const risk = action.side_effect_risk ?? "possible";
    return {
      outcome: "classification_failed",
      reasonCode: risk === "none" && !hasPlausibleSideEffects(action) ? "unknown_variant_unverified_read_only" : "unknown_variant_side_effect_possible",
      source: "unknown_variant_fallback",
      toolKind: action.tool_kind
    };
  }
  if (action.tool_kind === "bash") {
    if (!isBashActionShape(action)) {
      return {
        outcome: "classification_failed",
        reasonCode: "malformed_bash_action_shape",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    const normalizedCommand = action.command.toLowerCase();
    if (normalizedCommand.includes("force-push") || normalizedCommand.includes("drop database") || normalizedCommand.includes("npm publish") || normalizedCommand.includes("cargo publish") || normalizedCommand.includes("twine upload") || normalizedCommand.includes("hex.publish")) {
      return {
        outcome: "critical",
        reasonCode: "critical_command_pattern",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    if (action.destructive) {
      return {
        outcome: action.public_facing ? "critical" : "permanent",
        reasonCode: action.public_facing ? "destructive_public" : "destructive_local",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    if (/(^|\s)git\s+push\s+origin\s+main(\s|$)/.test(normalizedCommand) || normalizedCommand.includes("rm -rf")) {
      return {
        outcome: "permanent",
        reasonCode: "permanent_command_pattern",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    if (normalizedCommand.includes("mkdir") || normalizedCommand.includes("npm install")) {
      return {
        outcome: "routine",
        reasonCode: "routine_local_bash",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    if (/^\s*(cat|ls|pwd|git\s+status|git\s+diff|grep|find|head|tail)\b/.test(normalizedCommand)) {
      return {
        outcome: "trivial",
        reasonCode: "read_only_bash",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    if (action.external_side_effect) {
      return {
        outcome: "notable",
        reasonCode: "external_side_effect",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    return {
      outcome: "classification_failed",
      reasonCode: "unknown_bash_command",
      source: "deterministic",
      toolKind: action.tool_kind
    };
  }
  if (action.destructive) {
    return {
      outcome: action.public_facing ? "critical" : "permanent",
      reasonCode: action.public_facing ? "destructive_public" : "destructive_local",
      source: "deterministic",
      toolKind: action.tool_kind
    };
  }
  if (action.external_side_effect) {
    return {
      outcome: "notable",
      reasonCode: "external_side_effect",
      source: "deterministic",
      toolKind: action.tool_kind
    };
  }
  if (action.tool_kind === "webfetch") {
    if (!isWebfetchActionShape(action)) {
      return {
        outcome: "classification_failed",
        reasonCode: "malformed_webfetch_action_shape",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    if (action.known_safe_domain) {
      return {
        outcome: "trivial",
        reasonCode: "known_safe_webfetch",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    return {
      outcome: "notable",
      reasonCode: "unknown_web_domain",
      source: "deterministic",
      toolKind: action.tool_kind
    };
  }
  if (action.tool_kind === "edit") {
    if (!isEditActionShape(action)) {
      return {
        outcome: "classification_failed",
        reasonCode: "malformed_edit_action_shape",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    return {
      outcome: action.operation === "delete" ? "permanent" : "routine",
      reasonCode: action.operation === "delete" ? "edit_delete" : "edit_local_write",
      source: "deterministic",
      toolKind: action.tool_kind
    };
  }
  if (action.tool_kind === "mcp") {
    if (!isMcpActionShape(action)) {
      return {
        outcome: "classification_failed",
        reasonCode: "malformed_mcp_action_shape",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    return {
      outcome: action.read_only_declared ? "routine" : "notable",
      reasonCode: action.read_only_declared ? "mcp_read_only_declared" : "mcp_side_effect_possible",
      source: "deterministic",
      toolKind: action.tool_kind
    };
  }
  if (action.tool_kind === "computer_use") {
    if (!isComputerUseActionShape(action)) {
      return {
        outcome: "classification_failed",
        reasonCode: "malformed_computer_use_action_shape",
        source: "deterministic",
        toolKind: action.tool_kind
      };
    }
    return {
      outcome: action.external_side_effect ? "notable" : "routine",
      reasonCode: action.external_side_effect ? "computer_use_external_side_effect" : "computer_use_local",
      source: "deterministic",
      toolKind: action.tool_kind
    };
  }
  return {
    outcome: "classification_failed",
    reasonCode: "unhandled_known_tool_kind",
    source: "deterministic",
    toolKind: action.tool_kind
  };
}
function computeEscalationPath(params) {
  const sdkVersion = params.sdkVersion ?? AUTOPILOT_CLASSIFIER_VERSION;
  const version = evaluateClassifierVersionCompatibility({
    sdkVersion,
    policyVersion: params.policy.classifierVersion
  });
  if (!version.shouldProceed) {
    return {
      steps: ["defer_for_human_review"],
      reasonCode: "version_mismatch_lockdown",
      version
    };
  }
  if (params.classifiedAction.outcome === "classification_failed") {
    return {
      steps: ["defer_for_human_review"],
      reasonCode: "classification_failed",
      version
    };
  }
  const maxSeverity = LATITUDE_MAX_SEVERITY[params.policy.latitude];
  if (params.policy.latitude === "lockdown") {
    return {
      steps: ["defer_for_human_review"],
      reasonCode: "latitude_lockdown",
      version
    };
  }
  if (params.classifiedAction.outcome === "critical") {
    return {
      steps: ["defer_for_human_review"],
      reasonCode: "critical_always_defer",
      version
    };
  }
  if (maxSeverity === "none") {
    return {
      steps: ["defer_for_human_review"],
      reasonCode: "latitude_defer_all",
      version
    };
  }
  if (severityIndex(params.classifiedAction.outcome) > severityIndex(maxSeverity)) {
    return {
      steps: ["defer_for_human_review"],
      reasonCode: "severity_above_latitude",
      version
    };
  }
  const requested = clampStepOrder(params.policy.escalationStrategy ?? DEFAULT_ESCALATION_STRATEGY);
  const sandboxUsable = isValidSandboxSnapshot(params.capabilities) && supportsSandboxForToolKind(params.capabilities, params.classifiedAction.toolKind);
  if (params.policy.sandboxPreference === "required" && !sandboxUsable) {
    return {
      steps: ["defer_for_human_review"],
      reasonCode: "sandbox_required_but_unavailable",
      version
    };
  }
  let candidate = materialSteps(requested, sandboxUsable);
  if (params.policy.sandboxPreference === "preferred") {
    candidate = prioritizeSandboxStep(candidate, sandboxUsable);
  }
  if (params.policy.sandboxPreference === "avoid") {
    candidate = candidate.filter((step) => step !== "try_in_sandbox");
  }
  if (params.policy.sandboxPreference === "required") {
    candidate = candidate.filter((step) => step === "try_in_sandbox" || step === "defer_for_human_review");
    if (!candidate.includes("try_in_sandbox")) {
      candidate = ["try_in_sandbox", ...candidate];
    }
  }
  if (candidate.length === 0) {
    candidate = ["defer_for_human_review"];
  }
  if (!candidate.includes("defer_for_human_review")) {
    candidate = [...candidate, "defer_for_human_review"];
  }
  return {
    steps: candidate,
    reasonCode: "escalation_strategy_selected",
    version
  };
}
var AUTOPILOT_CLASSIFIER_VERSION, SEVERITY_TAXONOMY, LATITUDE_MAX_SEVERITY, CLASSIFIER_FIXTURES, KNOWN_TOOL_KINDS, QUESTION_CATEGORIES, SEVERITY_ORDER, DEFAULT_ESCALATION_STRATEGY;
var init_autopilot_classifier = __esm({
  "node_modules/@headsdown/sdk/dist/autopilot-classifier.js"() {
    AUTOPILOT_CLASSIFIER_VERSION = "1.1.0";
    SEVERITY_TAXONOMY = {
      trivial: {
        tier: 1,
        label: "Trivial",
        severity: "trivial",
        profile: "Read-only, local, or well-known safe target",
        criteria: [
          "No external side effect",
          "No identity-bound publish or communication",
          "Low reversal risk"
        ],
        examples: ["cat README.md", "ls", "fetch github.com/foo/bar README"]
      },
      routine: {
        tier: 2,
        label: "Routine",
        severity: "routine",
        profile: "Local write, reversible, project-scoped",
        criteria: [
          "Writes local state inside working scope",
          "Recoverable through normal workflows",
          "No immediate public artifact"
        ],
        examples: ["mkdir local/dir", "npm install in project dir", "edit local file"]
      },
      notable: {
        tier: 3,
        label: "Notable",
        severity: "notable",
        profile: "External side effect, usually recoverable",
        criteria: [
          "Touches external systems or unknown network targets",
          "May spend money or emit a side effect outside local filesystem",
          "Recovery possible but non-zero cost"
        ],
        examples: ["fetch random-blog.tld/x.pdf", "idempotent API write", "small money-spend"]
      },
      permanent: {
        tier: 4,
        label: "Permanent",
        severity: "permanent",
        profile: "Destructive, irreversible, or public-facing",
        criteria: [
          "Can destroy data or publish durable artifacts",
          "Not trivially reversible",
          "Likely to require explicit human accountability"
        ],
        examples: ["rm -rf project-subdir", "git push origin main", "gh pr create", "send email"]
      },
      critical: {
        tier: 5,
        label: "Critical",
        severity: "critical",
        profile: "Always defer regardless of latitude",
        criteria: [
          "High-risk irreversible action",
          "Large blast radius or compliance exposure",
          "Must never auto-attempt in v1"
        ],
        examples: ["force-push origin main", "drop database", "publish package", "send mass email"]
      }
    };
    LATITUDE_MAX_SEVERITY = {
      // Intentional: "hold" permits up to permanent actions because the user is assumed available for fast escalation handling.
      hold: "permanent",
      verify: "notable",
      balanced: "notable",
      cautious: "routine",
      lockdown: "none"
    };
    CLASSIFIER_FIXTURES = [
      { action: "fetch github.com README", expected: "trivial" },
      { action: "mkdir local/dir", expected: "routine" },
      { action: "npm install in project dir", expected: "routine" },
      { action: "fetch random-blog.tld/x.pdf", expected: "notable" },
      { action: "rm -rf project-subdir", expected: "permanent" },
      { action: "git push origin main", expected: "permanent" },
      { action: "force-push origin main", expected: "critical" },
      { action: "drop database", expected: "critical" },
      { action: "ask_user{recovery_decision, last=edit:failed}", expected: "permanent" },
      { action: "ask_user{tooling_choice, last=bash:succeeded}", expected: "routine" },
      { action: "ask_user{scope_clarification, last=webfetch:succeeded}", expected: "notable" },
      { action: "ask_user{approval_request, last=none:unavailable}", expected: "notable" }
    ];
    KNOWN_TOOL_KINDS = ["bash", "edit", "webfetch", "mcp", "computer_use"];
    QUESTION_CATEGORIES = [
      "scope_clarification",
      "approval_request",
      "tooling_choice",
      "data_input",
      "recovery_decision",
      "other"
    ];
    SEVERITY_ORDER = [
      "trivial",
      "routine",
      "notable",
      "permanent",
      "critical"
    ];
    DEFAULT_ESCALATION_STRATEGY = [
      "try_alternative",
      "try_in_sandbox",
      "defer_to_end_of_run",
      "defer_for_human_review"
    ];
  }
});

// node_modules/@headsdown/sdk/dist/autopilot-policy.js
async function fetchAutopilotPolicy(client, mode) {
  const transport = client.graphql;
  if (!transport || typeof transport.request !== "function") {
    throw new ValidationError("HeadsDownClient GraphQL transport is unavailable.", "client");
  }
  const data = await transport.request(AUTOPILOT_POLICY_QUERY, { mode: toGraphQLEnum2(mode) });
  const policy = normalizeAutopilotPolicy(data.autopilotPolicy);
  assertAutopilotPolicy(policy);
  return policy;
}
function assertAutopilotPolicy(value) {
  const policy = value;
  if (!policy || typeof policy !== "object") {
    throw new ValidationError("Autopilot policy is required.", "autopilotPolicy");
  }
  if (typeof policy.classifierVersion !== "string" || !policy.classifierVersion.trim()) {
    throw new ValidationError("classifierVersion is required.", "autopilotPolicy.classifierVersion");
  }
  if (!isLatitude(policy.latitude)) {
    throw new ValidationError("latitude is invalid.", "autopilotPolicy.latitude");
  }
  if (policy.escalationStrategy !== void 0 && (!Array.isArray(policy.escalationStrategy) || !policy.escalationStrategy.every(isEscalationStep))) {
    throw new ValidationError("escalationStrategy is invalid.", "autopilotPolicy.escalationStrategy");
  }
  if (policy.identityActionOverrides !== void 0 && !isStringArray(policy.identityActionOverrides)) {
    throw new ValidationError("identityActionOverrides is invalid.", "autopilotPolicy.identityActionOverrides");
  }
  if (policy.houseRules !== void 0 && !isStringArray(policy.houseRules)) {
    throw new ValidationError("houseRules is invalid.", "autopilotPolicy.houseRules");
  }
  if (policy.sandboxPreference !== void 0 && !isSandboxPreference(policy.sandboxPreference)) {
    throw new ValidationError("sandboxPreference is invalid.", "autopilotPolicy.sandboxPreference");
  }
  assertPrivacySafe(policy, "autopilotPolicy");
}
function normalizeAutopilotPolicy(value) {
  if (!value || typeof value !== "object") {
    throw new ValidationError("autopilotPolicy response is missing.", "autopilotPolicy");
  }
  const raw = value;
  return stripUndefined3({
    classifierVersion: requireString(raw.classifierVersion, "classifierVersion"),
    latitude: normalizeLatitude(raw.latitude),
    escalationStrategy: normalizeEscalationStrategy(raw.escalationStrategy),
    sandboxPreference: normalizeSandboxPreference(raw.sandboxPreference),
    identityActionOverrides: normalizeIdentityActionOverrides(raw.identityActionOverrides),
    houseRules: normalizeHouseRules(raw.houseRules)
  });
}
function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${field} is required.`, `autopilotPolicy.${field}`);
  }
  return value.trim();
}
function normalizeLatitude(value) {
  const normalized = normalizeEnumToken(value);
  if (isLatitude(normalized))
    return normalized;
  throw new ValidationError("latitude is invalid.", "autopilotPolicy.latitude");
}
function normalizeEscalationStrategy(value) {
  if (value === void 0 || value === null)
    return void 0;
  if (!Array.isArray(value)) {
    throw new ValidationError("escalationStrategy is invalid.", "autopilotPolicy.escalationStrategy");
  }
  const normalized = value.map(normalizeEnumToken);
  if (!normalized.every(isEscalationStep)) {
    throw new ValidationError("escalationStrategy is invalid.", "autopilotPolicy.escalationStrategy");
  }
  return normalized;
}
function normalizeSandboxPreference(value) {
  if (value === void 0 || value === null)
    return void 0;
  const normalized = normalizeEnumToken(value);
  if (normalized === "optional")
    return void 0;
  if (normalized === "disabled")
    return "avoid";
  if (isSandboxPreference(normalized))
    return normalized;
  throw new ValidationError("sandboxPreference is invalid.", "autopilotPolicy.sandboxPreference");
}
function normalizeIdentityActionOverrides(value) {
  if (value === void 0 || value === null)
    return [];
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return normalizeStringArray(value);
  }
  if (!Array.isArray(value)) {
    throw new ValidationError("identityActionOverrides is invalid.", "autopilotPolicy.identityActionOverrides");
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new ValidationError("identityActionOverrides is invalid.", "autopilotPolicy.identityActionOverrides");
    }
    const record = entry;
    const actionKey = requireString(record.actionKey, "identityActionOverrides.actionKey");
    const strategy = normalizeEnumToken(requireString(record.strategy, "identityActionOverrides.strategy"));
    if (!strategy) {
      throw new ValidationError("identityActionOverrides is invalid.", "autopilotPolicy.identityActionOverrides");
    }
    return `${actionKey}:${strategy}`;
  });
}
function normalizeHouseRules(value) {
  if (typeof value === "string") {
    return value.split(/\r?\n/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  }
  return normalizeStringArray(value);
}
function normalizeStringArray(value) {
  if (value === void 0 || value === null)
    return [];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new ValidationError("Expected string array.", "autopilotPolicy");
  }
  return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function normalizeEnumToken(value) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase().replaceAll("_", "-").replaceAll("-", "_") : null;
}
function isLatitude(value) {
  return value === "hold" || value === "verify" || value === "balanced" || value === "cautious" || value === "lockdown";
}
function isEscalationStep(value) {
  return value === "try_alternative" || value === "try_in_sandbox" || value === "defer_to_end_of_run" || value === "defer_for_human_review";
}
function isSandboxPreference(value) {
  return value === "preferred" || value === "required" || value === "avoid";
}
function toGraphQLEnum2(value) {
  return value.toUpperCase();
}
function stripUndefined3(value) {
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== void 0));
}
var init_autopilot_policy = __esm({
  "node_modules/@headsdown/sdk/dist/autopilot-policy.js"() {
    init_agent_run_events();
    init_errors();
    init_queries();
    init_queries();
  }
});

// node_modules/@headsdown/sdk/dist/classifier-telemetry.js
var init_classifier_telemetry = __esm({
  "node_modules/@headsdown/sdk/dist/classifier-telemetry.js"() {
    init_autopilot_classifier();
    init_errors();
  }
});

// node_modules/@headsdown/sdk/dist/local-session-summary.js
function assertLocalSessionSummary(value) {
  assertPrivacySafe(value, "localSessionSummary");
  if (!isRecord(value)) {
    throw new ValidationError("localSessionSummary must be an object.", "localSessionSummary");
  }
  const keys = Object.keys(value);
  for (const field of LOCAL_SESSION_SUMMARY_FIELD_NAMES) {
    if (!(field in value)) {
      throw new ValidationError(`Missing required localSessionSummary field '${field}'.`, field);
    }
  }
  for (const key of keys) {
    if (!LOCAL_SESSION_SUMMARY_FIELD_NAMES.has(key)) {
      throw new ValidationError(`Unexpected localSessionSummary field '${key}'.`, key);
    }
  }
  const summary2 = value;
  if (summary2.version !== LOCAL_SESSION_SUMMARY_VERSION) {
    throw new ValidationError(`localSessionSummary.version must be ${LOCAL_SESSION_SUMMARY_VERSION}.`, "version");
  }
  assertSafeToken2(summary2.sessionId, "sessionId");
  assertIsoTimestamp2(summary2.generatedAt, "generatedAt");
  assertBoolean2(summary2.stale, "stale");
  assertCount(summary2.toolCallCount, "toolCallCount");
  assertCount(summary2.fileChangeCount, "fileChangeCount");
  assertCount(summary2.deferredDecisionCount, "deferredDecisionCount");
  assertBoolean2(summary2.continuationArtifactAvailable, "continuationArtifactAvailable");
  assertBoolean2(summary2.validationLocallyPassed, "validationLocallyPassed");
  if (summary2.approvedProposalRef !== null) {
    assertSafeToken2(summary2.approvedProposalRef, "approvedProposalRef");
  }
  if (typeof summary2.outcomeCategory !== "string" || !LOCAL_SESSION_SUMMARY_OUTCOME_CATEGORIES.includes(summary2.outcomeCategory)) {
    throw new ValidationError("localSessionSummary.outcomeCategory must be a supported enum value.", "outcomeCategory");
  }
}
function assertSafeToken2(value, field) {
  if (typeof value !== "string" || value.length === 0 || !SAFE_TOKEN_REGEX.test(value)) {
    throw new ValidationError(`${field} must be a 1-256 character token using only letters, numbers, _, ., :, or -.`, field);
  }
}
function assertIsoTimestamp2(value, field) {
  if (typeof value !== "string" || !ISO_DATE_TIME_REGEX.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${field} must be a valid RFC3339 date-time timestamp.`, field);
  }
}
function assertBoolean2(value, field) {
  if (typeof value !== "boolean") {
    throw new ValidationError(`${field} must be a boolean.`, field);
  }
}
function assertCount(value, field) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${field} must be a non-negative integer.`, field);
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var LOCAL_SESSION_SUMMARY_VERSION, LOCAL_SESSION_SUMMARY_OUTCOME_CATEGORIES, SAFE_TOKEN_PATTERN, SAFE_TOKEN_REGEX, ISO_DATE_TIME_REGEX, LOCAL_SESSION_SUMMARY_FIELD_NAMES;
var init_local_session_summary = __esm({
  "node_modules/@headsdown/sdk/dist/local-session-summary.js"() {
    init_agent_run_events();
    init_errors();
    LOCAL_SESSION_SUMMARY_VERSION = 1;
    LOCAL_SESSION_SUMMARY_OUTCOME_CATEGORIES = [
      "in_progress",
      "completed",
      "tabled",
      "deferred_for_review"
    ];
    SAFE_TOKEN_PATTERN = "^[A-Za-z0-9_.:-]{1,256}$";
    SAFE_TOKEN_REGEX = new RegExp(SAFE_TOKEN_PATTERN);
    ISO_DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
    LOCAL_SESSION_SUMMARY_FIELD_NAMES = /* @__PURE__ */ new Set([
      "version",
      "sessionId",
      "generatedAt",
      "stale",
      "toolCallCount",
      "fileChangeCount",
      "deferredDecisionCount",
      "continuationArtifactAvailable",
      "validationLocallyPassed",
      "approvedProposalRef",
      "outcomeCategory"
    ]);
  }
});

// node_modules/@headsdown/sdk/dist/integration-event.js
var VARIANT_SPECS, INTEGRATION_EVENT_TYPE, SESSION_OUTCOMES, SESSION_ENDED_REASONS, TURN_FAILED_REASONS, TOOL_KINDS, TOOL_DURATION_BUCKETS, TOOL_FAILED_REASONS, PERMISSION_DENIED_RESOLUTIONS, CONTEXT_SIZE_BUCKETS;
var init_integration_event = __esm({
  "node_modules/@headsdown/sdk/dist/integration-event.js"() {
    init_agent_run_events();
    init_errors();
    VARIANT_SPECS = {
      session_started: {
        wire_type: "integration.session_started",
        required: ["session_id"],
        optional: ["capabilities"],
        enums: {}
      },
      session_ended: {
        wire_type: "integration.session_ended",
        required: ["session_id", "outcome"],
        optional: ["duration_seconds", "turn_count", "reason", "ended_at"],
        enums: {
          outcome: ["succeeded", "failed", "cancelled", "timed_out"],
          reason: [
            "clear",
            "resume",
            "logout",
            "prompt_input_exit",
            "bypass_permissions_disabled",
            "other"
          ]
        }
      },
      turn_started: {
        wire_type: "integration.turn_started",
        required: ["turn_id", "session_id"],
        optional: ["sequence"],
        enums: {}
      },
      turn_ended: {
        wire_type: "integration.turn_ended",
        required: ["turn_id", "session_id", "tool_calls_count"],
        optional: ["duration_seconds"],
        enums: {}
      },
      turn_failed: {
        wire_type: "integration.turn_failed",
        required: ["turn_id", "session_id", "reason"],
        optional: ["duration_seconds"],
        enums: {
          reason: ["api_error", "timeout", "cancelled", "rate_limited", "unknown"]
        }
      },
      tool_invoked: {
        wire_type: "integration.tool_invoked",
        required: ["tool_id", "session_id", "tool_kind"],
        optional: ["turn_id", "tool_name_bucket"],
        enums: {
          tool_kind: ["read", "write", "external"]
        }
      },
      tool_succeeded: {
        wire_type: "integration.tool_succeeded",
        required: ["tool_id", "session_id"],
        optional: ["turn_id", "duration_ms_bucket"],
        enums: {
          duration_ms_bucket: ["under_100ms", "100ms_to_1s", "1s_to_10s", "over_10s", "unknown"]
        }
      },
      tool_failed: {
        wire_type: "integration.tool_failed",
        required: ["tool_id", "session_id", "reason"],
        optional: ["turn_id"],
        enums: {
          reason: ["permission_denied", "execution_error", "timeout", "unknown"]
        }
      },
      permission_denied: {
        wire_type: "integration.permission_denied",
        required: ["decision_id", "session_id", "action_kind_bucket", "resolution"],
        optional: [],
        enums: {
          resolution: ["user_denied", "auto_denied", "policy"]
        }
      },
      context_compacted: {
        wire_type: "integration.context_compacted",
        required: ["session_id", "post_context_bucket"],
        optional: ["turn_id", "prior_context_bucket"],
        enums: {
          prior_context_bucket: [
            "under_10k",
            "10k_to_50k",
            "50k_to_100k",
            "100k_to_200k",
            "over_200k",
            "unknown"
          ],
          post_context_bucket: [
            "under_10k",
            "10k_to_50k",
            "50k_to_100k",
            "100k_to_200k",
            "over_200k",
            "unknown"
          ]
        }
      }
    };
    INTEGRATION_EVENT_TYPE = {
      session_started: VARIANT_SPECS.session_started.wire_type,
      session_ended: VARIANT_SPECS.session_ended.wire_type,
      turn_started: VARIANT_SPECS.turn_started.wire_type,
      turn_ended: VARIANT_SPECS.turn_ended.wire_type,
      turn_failed: VARIANT_SPECS.turn_failed.wire_type,
      tool_invoked: VARIANT_SPECS.tool_invoked.wire_type,
      tool_succeeded: VARIANT_SPECS.tool_succeeded.wire_type,
      tool_failed: VARIANT_SPECS.tool_failed.wire_type,
      permission_denied: VARIANT_SPECS.permission_denied.wire_type,
      context_compacted: VARIANT_SPECS.context_compacted.wire_type
    };
    SESSION_OUTCOMES = new Set(VARIANT_SPECS.session_ended.enums.outcome);
    SESSION_ENDED_REASONS = new Set(VARIANT_SPECS.session_ended.enums.reason);
    TURN_FAILED_REASONS = new Set(VARIANT_SPECS.turn_failed.enums.reason);
    TOOL_KINDS = new Set(VARIANT_SPECS.tool_invoked.enums.tool_kind);
    TOOL_DURATION_BUCKETS = new Set(VARIANT_SPECS.tool_succeeded.enums.duration_ms_bucket);
    TOOL_FAILED_REASONS = new Set(VARIANT_SPECS.tool_failed.enums.reason);
    PERMISSION_DENIED_RESOLUTIONS = new Set(VARIANT_SPECS.permission_denied.enums.resolution);
    CONTEXT_SIZE_BUCKETS = new Set(VARIANT_SPECS.context_compacted.enums.post_context_bucket);
  }
});

// node_modules/@headsdown/sdk/dist/index.js
var init_dist = __esm({
  "node_modules/@headsdown/sdk/dist/index.js"() {
    init_client();
    init_auth();
    init_config();
    init_proposals();
    init_calibration();
    init_errors();
    init_wrap_up();
    init_execution_directive();
    init_referee();
    init_agent_control();
    init_autopilot_classifier();
    init_autopilot_policy();
    init_classifier_telemetry();
    init_agent_control_actions();
    init_types();
    init_agent_run_events();
    init_local_session_summary();
    init_integration_event();
  }
});

// node_modules/@headsdown/sdk/dist/agent-rendering.js
function renderHeadsDownCallForAgent(call) {
  const fallback = resolveHeadsDownCallFallback(call);
  const fallbackCopy = AGENT_CALL_FALLBACK_COPY[fallback.effectiveKey];
  const useServerActionMetadata = fallback.reason === "known_key";
  const title = safeRenderCopy(call.title, fallbackCopy.title, call.privacyMode);
  const body = safeRenderCopy(call.body, fallbackCopy.body, call.privacyMode);
  return {
    callKey: fallback.effectiveKey,
    originalKey: call.key,
    unknownKey: fallback.unknownKey,
    title: title.value,
    titleSource: title.source,
    body: body.value,
    bodySource: body.source,
    severity: call.severity,
    urgency: call.urgency,
    primaryAction: fallback.primaryActionKey ? renderAction(call, fallback.primaryActionKey, useServerActionMetadata ? fallback.primaryActionIntent : "none", useServerActionMetadata ? "primary" : "fallback", useServerActionMetadata) : null,
    secondaryAction: fallback.secondaryActionKey ? renderAction(call, fallback.secondaryActionKey, fallback.secondaryActionIntent, "secondary", useServerActionMetadata) : null,
    allowedActions: knownAllowedActions(call, fallback.reason).map((actionKey) => renderAction(call, actionKey, useServerActionMetadata ? intentForAllowedAction(call, actionKey) : "none", "allowed", useServerActionMetadata)),
    reasonCodes: [...call.reasonCodes],
    confidence: call.confidence,
    privacyMode: call.privacyMode,
    expiresAt: call.expiresAt,
    fallbackReason: fallback.reason
  };
}
function isHeadsDownCallKey(value) {
  return typeof value === "string" && HEADSDOWN_CALL_KEYS.includes(value);
}
function isHeadsDownActionKey(value) {
  return typeof value === "string" && HEADSDOWN_ACTION_KEYS.includes(value);
}
function isSafeAgentRenderCopy(value, privacyMode) {
  const trimmed = value.trim();
  if (trimmed.length === 0 || privacyMode !== "privacy_safe")
    return false;
  try {
    assertPrivacySafe(trimmed, "headsdownCall.copy");
    return true;
  } catch {
    return false;
  }
}
function safeRenderCopy(value, fallback, privacyMode) {
  const trimmed = value.trim();
  if (isSafeAgentRenderCopy(trimmed, privacyMode)) {
    return { value: trimmed, source: "server" };
  }
  return { value: fallback, source: "fallback" };
}
function knownAllowedActions(call, fallbackReason) {
  const knownActions = Array.from(new Set(call.allowedActionKnownKeys.filter(isHeadsDownActionKey)));
  if (fallbackReason === "known_key")
    return knownActions;
  return knownActions.filter((actionKey) => AGENT_UNKNOWN_CALL_SAFE_ACTIONS.includes(actionKey));
}
function renderAction(call, actionKey, intent, requestedSource, useServerActionMetadata) {
  const source = useServerActionMetadata ? actionSource(call, actionKey, requestedSource) : requestedSource;
  return {
    key: actionKey,
    label: useServerActionMetadata ? actionLabel(call, actionKey, source) : AGENT_ACTION_LABELS[actionKey],
    renderHint: renderHintForIntent(intent),
    source
  };
}
function actionSource(call, actionKey, requestedSource) {
  if (call.primaryActionKnownKey === actionKey)
    return "primary";
  if (call.secondaryActionKnownKey === actionKey)
    return "secondary";
  if (call.recommendedActionKnownKey === actionKey)
    return "recommended";
  return requestedSource;
}
function actionLabel(call, actionKey, source) {
  const serverLabel = source === "primary" ? call.primaryActionLabel : source === "secondary" ? call.secondaryActionLabel : null;
  if (serverLabel && isSafeAgentRenderCopy(serverLabel, call.privacyMode)) {
    return serverLabel.trim();
  }
  return AGENT_ACTION_LABELS[actionKey];
}
function intentForAllowedAction(call, actionKey) {
  if (call.primaryActionKnownKey === actionKey)
    return call.primaryActionIntent;
  if (call.secondaryActionKnownKey === actionKey)
    return call.secondaryActionIntent;
  return "none";
}
function renderHintForIntent(intent) {
  switch (intent) {
    case "review_request":
      return "review";
    case "view_queue":
      return "queue";
    case "review_handoff":
      return "handoff";
    case "view_receipts":
      return "receipts";
    case "view_details":
    case "review_runs":
    case "adjust_playbooks":
    case "start_run":
      return "inspect";
    case "none":
      return "none";
    default:
      return "inspect";
  }
}
var AGENT_UNKNOWN_CALL_SAFE_ACTIONS, AGENT_ACTION_LABELS, AGENT_CALL_FALLBACK_COPY;
var init_agent_rendering = __esm({
  "node_modules/@headsdown/sdk/dist/agent-rendering.js"() {
    init_agent_control();
    init_agent_run_events();
    init_types();
    AGENT_UNKNOWN_CALL_SAFE_ACTIONS = [
      "keep_queued",
      "pause_and_summarize",
      "queue_for_later",
      "stop_run"
    ];
    AGENT_ACTION_LABELS = {
      continue: "Continue",
      continue_with_limit: "Continue with limit",
      narrow_scope: "Narrow scope",
      ask_user: "Ask user",
      queue_for_later: "Queue for later",
      queue_for_morning: "Queue for morning",
      pause_and_summarize: "Pause and summarize",
      stop_run: "Stop run",
      resume_run: "Resume run",
      allow_once: "Allow once",
      allow_for_duration: "Allow for duration",
      create_temporary_exception: "Create temporary exception",
      keep_queued: "Keep queued"
    };
    AGENT_CALL_FALLBACK_COPY = {
      good_to_run: {
        title: "Good to run",
        body: "HeadsDown says this run can proceed inside the current boundary."
      },
      keep_it_tight: {
        title: "Keep it tight",
        body: "HeadsDown needs the agent to stay inside a tighter slice before continuing."
      },
      attention_window_closing: {
        title: "Window closing",
        body: "The current attention window is closing soon. Wrap up or extend intentionally."
      },
      not_worth_starting_now: {
        title: "Not worth starting now",
        body: "HeadsDown recommends queueing this instead of starting it right now."
      },
      off_the_clock: {
        title: "Off the clock",
        body: "Queue this for later so the work is not lost."
      },
      finish_line_friction: {
        title: "Finish-line friction",
        body: "Validation or delivery is stuck while scope appears stable."
      },
      rabbit_hole_detected: {
        title: "Rabbit hole detected",
        body: "Progress signals suggest the run should pause, summarize, or narrow before continuing."
      },
      ready_to_resume: {
        title: "Ready to resume",
        body: "A queued run has a saved handoff and is ready to continue."
      },
      all_contained: {
        title: "All contained",
        body: "Runs are staying inside your time, scope, and interruption limits. Nothing needs you right now."
      },
      needs_your_yes: {
        title: "Needs your yes",
        body: "HeadsDown needs a human decision before this agent continues."
      }
    };
  }
});

// node_modules/@headsdown/sdk/dist/agent.js
var init_agent = __esm({
  "node_modules/@headsdown/sdk/dist/agent.js"() {
    init_agent_rendering();
    init_agent_control();
    init_agent_control_actions();
    init_agent_run_events();
    init_local_session_summary();
    init_types();
    init_errors();
  }
});

// src/sdk-compat.ts
function getLowLevelGraphQLClient(client) {
  const maybeGraphQL = client.graphql;
  if (!maybeGraphQL || typeof maybeGraphQL !== "object") return null;
  const request = maybeGraphQL.request;
  if (typeof request !== "function") return null;
  return {
    request: request.bind(maybeGraphQL)
  };
}
var init_sdk_compat = __esm({
  "src/sdk-compat.ts"() {
    "use strict";
  }
});

// src/agent-control.ts
function renderHeadsDownCall(call) {
  const rendered = renderHeadsDownCallForAgent(toSdkHeadsDownCall(call));
  const allowedActionKeys = rendered.allowedActions.map((action) => action.key);
  const allowedActionsLine = renderAllowedActionsLine(allowedActionKeys);
  const text = [
    `HeadsDown call: ${rendered.title}.`,
    rendered.body,
    allowedActionsLine,
    "Claude Code controls the model. HeadsDown controls the run."
  ].join("\n");
  return {
    key: rendered.originalKey,
    knownKey: rendered.unknownKey ? null : rendered.callKey,
    title: rendered.title,
    text,
    intervention: isInterventionCall(rendered),
    safeFallback: rendered.fallbackReason !== "known_key",
    allowedActionKeys
  };
}
async function getAgentControlOverviewCompat(client) {
  let nativeOverview = null;
  if (typeof client.getAgentControlOverview === "function") {
    try {
      nativeOverview = await client.getAgentControlOverview();
      if (nativeOverview.sessionSummaries && nativeOverview.sessionSummaries.length > 0) {
        return nativeOverview;
      }
    } catch {
      nativeOverview = null;
    }
  }
  const graphql = getLowLevelGraphQLClient(client);
  if (!graphql) return nativeOverview;
  try {
    const data = await graphql.request(AGENT_CONTROL_OVERVIEW_QUERY2);
    return data.agentControlOverview ?? nativeOverview;
  } catch {
    return nativeOverview;
  }
}
function toSdkHeadsDownCall(call) {
  return {
    key: cleanText(call.key) ?? "needs_your_yes",
    knownKey: normalizeCallKey(call.knownKey) ?? normalizeCallKey(call.key),
    title: cleanText(call.title) ?? "",
    body: cleanText(call.body) ?? "",
    severity: normalizeSeverity(call.severity),
    urgency: normalizeUrgency(call.urgency),
    primaryActionLabel: cleanText(call.primaryActionLabel),
    primaryActionKey: cleanText(call.primaryActionKey),
    primaryActionKnownKey: normalizeActionKey(call.primaryActionKnownKey) ?? normalizeActionKey(call.primaryActionKey),
    primaryActionIntent: normalizeUiIntent(call.primaryActionIntent),
    secondaryActionLabel: cleanText(call.secondaryActionLabel),
    secondaryActionKey: cleanText(call.secondaryActionKey),
    secondaryActionKnownKey: normalizeActionKey(call.secondaryActionKnownKey) ?? normalizeActionKey(call.secondaryActionKey),
    secondaryActionIntent: normalizeUiIntent(call.secondaryActionIntent),
    recommendedActionKey: cleanText(call.recommendedActionKey),
    recommendedActionKnownKey: normalizeActionKey(call.recommendedActionKnownKey) ?? normalizeActionKey(call.recommendedActionKey),
    allowedActionKeys: normalizeStrings(call.allowedActionKeys),
    allowedActionKnownKeys: normalizeActionKeys(
      call.allowedActionKnownKeys && call.allowedActionKnownKeys.length > 0 ? call.allowedActionKnownKeys : call.allowedActionKeys
    ),
    allowedUiIntents: normalizeUiIntents(call.allowedUiIntents),
    reasonCodes: normalizeStrings(call.reasonCodes),
    confidence: normalizeConfidence(call.confidence),
    evidenceSource: normalizeEvidenceSource(call.evidenceSource),
    privacyMode: normalizePrivacyMode(call.privacyMode),
    expiresAt: cleanText(call.expiresAt)
  };
}
function isInterventionCall(call) {
  if (NON_INTERVENTION_KEYS.has(call.callKey)) return false;
  if (call.allowedActions.length > 0) return true;
  return !NON_INTERVENTION_KEYS.has(call.callKey);
}
function renderAllowedActionsLine(allowedActionKeys) {
  if (allowedActionKeys.length === 0) {
    return "Allowed actions: none.";
  }
  return `Allowed actions: ${allowedActionKeys.join(", ")}.`;
}
function normalizeCallKey(value) {
  const normalized = normalizeToken2(value);
  return normalized && isHeadsDownCallKey(normalized) ? normalized : null;
}
function normalizeActionKey(value) {
  const normalized = normalizeToken2(value);
  return normalized && isHeadsDownActionKey(normalized) ? normalized : null;
}
function normalizeActionKeys(values) {
  return [
    ...new Set(
      normalizeStrings(values).map(normalizeActionKey).filter((value) => !!value)
    )
  ];
}
function normalizeStrings(values) {
  if (!values || values.length === 0) return [];
  return [...new Set(values.map(cleanText).filter((value) => !!value))];
}
function normalizeUiIntent(value) {
  const normalized = normalizeToken2(value);
  switch (normalized) {
    case "view_details":
    case "review_request":
    case "review_runs":
    case "review_handoff":
    case "view_queue":
    case "view_receipts":
    case "adjust_playbooks":
    case "start_run":
    case "none":
      return normalized;
    default:
      return "none";
  }
}
function normalizeUiIntents(values) {
  if (!values || values.length === 0) return [];
  return [...new Set(values.map(normalizeUiIntent))];
}
function normalizeSeverity(value) {
  const normalized = normalizeToken2(value);
  switch (normalized) {
    case "positive":
    case "neutral":
    case "caution":
    case "boundary":
    case "action_required":
    case "critical":
      return normalized;
    default:
      return "neutral";
  }
}
function normalizeUrgency(value) {
  const normalized = normalizeToken2(value);
  switch (normalized) {
    case "low":
    case "normal":
    case "elevated":
    case "high":
      return normalized;
    default:
      return "normal";
  }
}
function normalizeConfidence(value) {
  const normalized = normalizeToken2(value);
  switch (normalized) {
    case "exact":
    case "estimated":
    case "unknown":
      return normalized;
    default:
      return "exact";
  }
}
function normalizeEvidenceSource(value) {
  const normalized = normalizeToken2(value);
  switch (normalized) {
    case "contract":
    case "engine":
    case "run_summary":
    case "needs_your_yes":
    case "fallback":
      return normalized;
    default:
      return "fallback";
  }
}
function normalizePrivacyMode(value) {
  const normalized = normalizeToken2(value);
  switch (normalized) {
    case "privacy_restricted":
    case "unknown":
      return normalized;
    default:
      return "privacy_safe";
  }
}
function normalizeToken2(value) {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  return cleaned.replace(/([a-z\d])([A-Z])/g, "$1_$2").replace(/[\s\-]+/g, "_").toLowerCase();
}
function cleanText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[\r\n\t]+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}
var NON_INTERVENTION_KEYS, AGENT_CONTROL_OVERVIEW_QUERY2;
var init_agent_control2 = __esm({
  "src/agent-control.ts"() {
    "use strict";
    init_agent();
    init_sdk_compat();
    NON_INTERVENTION_KEYS = /* @__PURE__ */ new Set(["good_to_run", "ready_to_resume", "all_contained"]);
    AGENT_CONTROL_OVERVIEW_QUERY2 = `
  query AgentControlOverviewForClaudeRendering {
    agentControlOverview {
      headsdownCall {
        key
        knownKey
        title
        body
        severity
        urgency
        primaryActionLabel
        primaryActionKey
        primaryActionKnownKey
        primaryActionIntent
        secondaryActionLabel
        secondaryActionKey
        secondaryActionKnownKey
        secondaryActionIntent
        recommendedActionKey
        recommendedActionKnownKey
        allowedActionKeys
        allowedActionKnownKeys
        allowedUiIntents
        reasonCodes
        confidence
        evidenceSource
        privacyMode
        expiresAt
      }
      runSummaries {
        runId
        callKey
        allowedActionKeys
      }
      sessionSummaries {
        sessionId
        timeboxExpiresAt
        pendingTimeboxExtensionRequest {
          id
          requestedExtensionMinutes
          requestedAt
        }
      }
    }
  }
`;
  }
});

// src/agent-run-state.ts
import { access, mkdir as mkdir4, readFile as readFile4, writeFile as writeFile4 } from "node:fs/promises";
import { dirname as dirname2, join as join4 } from "node:path";
import { homedir as homedir3 } from "node:os";
function agentRunStatePath() {
  const override = process.env.HEADSDOWN_AGENT_RUN_STATE_PATH?.trim();
  if (override) return override;
  return join4(homedir3(), ".config", "headsdown", "agent-run-state.json");
}
async function readStateFile() {
  try {
    await access(agentRunStatePath());
  } catch {
    return { ...DEFAULT_STATE };
  }
  try {
    const raw = await readFile4(agentRunStatePath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.runs || typeof parsed.runs !== "object") {
      return { ...DEFAULT_STATE };
    }
    return {
      runs: parsed.runs,
      activeRunsBySession: parsed.activeRunsBySession && typeof parsed.activeRunsBySession === "object" ? parsed.activeRunsBySession : {}
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}
async function writeStateFile(state) {
  await mkdir4(dirname2(agentRunStatePath()), { recursive: true });
  await writeFile4(agentRunStatePath(), JSON.stringify(state, null, 2), { mode: 384 });
}
async function getRunState(runId) {
  const state = await readStateFile();
  return state.runs[runId] ?? null;
}
async function upsertRunState(runId, updater) {
  const state = await readStateFile();
  const current = state.runs[runId] ?? null;
  const next = updater(current);
  state.runs[runId] = next;
  await writeStateFile(state);
  return next;
}
async function getActiveRunStateForSession(sessionId = currentSessionId()) {
  const state = await readStateFile();
  const runId = state.activeRunsBySession[sessionId];
  return runId ? state.runs[runId] ?? null : null;
}
async function setActiveRunForSession(runId, sessionId = currentSessionId()) {
  const state = await readStateFile();
  state.activeRunsBySession[sessionId] = runId;
  await writeStateFile(state);
}
async function clearRunState(runId) {
  const state = await readStateFile();
  if (!state.runs[runId]) return;
  delete state.runs[runId];
  for (const [sessionId, activeRunId] of Object.entries(state.activeRunsBySession)) {
    if (activeRunId === runId) delete state.activeRunsBySession[sessionId];
  }
  await writeStateFile(state);
}
function createInitialRunState(input) {
  return {
    runId: input.proposalId,
    proposalId: input.proposalId,
    startedAt: input.nowIso,
    sequence: 0,
    estimatedFiles: typeof input.estimatedFiles === "number" ? input.estimatedFiles : null,
    sessionId: currentSessionId(),
    toolCallsCount: 0,
    toolReadCount: 0,
    toolWriteCount: 0,
    toolExternalCount: 0,
    filesModifiedCount: null,
    retryCount: 0,
    failureCount: 0,
    redirectCount: 0,
    startedReported: false,
    terminalOutcome: null
  };
}
function nextSequence(state) {
  return { ...state, sequence: state.sequence + 1 };
}
function currentSessionId() {
  return process.env.CLAUDE_SESSION_ID?.trim() || "default";
}
var DEFAULT_STATE;
var init_agent_run_state = __esm({
  "src/agent-run-state.ts"() {
    "use strict";
    DEFAULT_STATE = { runs: {}, activeRunsBySession: {} };
  }
});

// src/agent-run-progress.ts
function bucketMinutes2(minutes) {
  if (minutes === null || minutes === void 0 || minutes < 0) return "unknown";
  if (minutes < 15) return "under_15";
  if (minutes <= 30) return "15_to_30";
  if (minutes <= 60) return "30_to_60";
  if (minutes <= 120) return "60_to_120";
  return "over_120";
}
function mapOutcomeToTaxonomy(outcome) {
  switch (outcome) {
    case "completed":
      return "succeeded";
    case "failed":
    case "timed_out":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "partially_completed":
      return "paused";
  }
}
function startedPayload(input) {
  return {
    task_category: "coding_agent_change",
    task_size_bucket: typeof input.estimatedMinutes === "number" && input.estimatedMinutes > 60 ? "medium" : "small",
    started_by: "agent",
    initial_call_key: "good_to_run",
    estimated_minutes_bucket: bucketMinutes2(input.estimatedMinutes),
    estimated_files_bucket: bucketFileCount(input.estimatedFiles ?? void 0),
    delivery_mode: "auto"
  };
}
function progressPayload(state, now = /* @__PURE__ */ new Date()) {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(state.startedAt).getTime()) / 1e3)
  );
  const scopeChanged = typeof state.estimatedFiles === "number" && state.estimatedFiles > 0 && typeof state.filesModifiedCount === "number" ? state.filesModifiedCount > state.estimatedFiles : false;
  return {
    elapsedSeconds,
    toolCallsCount: state.toolCallsCount,
    toolReadCount: state.toolReadCount,
    toolWriteCount: state.toolWriteCount,
    toolExternalCount: state.toolExternalCount,
    filesReadBucket: "unknown",
    filesModifiedBucket: bucketFileCount(state.filesModifiedCount ?? void 0),
    validationLevel: "unknown",
    validationStatus: "unknown",
    retryCount: state.retryCount,
    failureCount: state.failureCount,
    scopeChanged,
    redirectCount: state.redirectCount,
    progressState: "working",
    scopeGrowthBucket: bucketScopeGrowth(state.filesModifiedCount ?? void 0),
    confidenceBucket: "medium",
    spendEstimateBucket: "unknown"
  };
}
function buildTerminalEvent(state, outcome, input) {
  const now = input.now ?? /* @__PURE__ */ new Date();
  const durationSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(state.startedAt).getTime()) / 1e3)
  );
  const validationStatus = input.testsPassed === true ? "passed" : input.testsPassed === false ? "failed" : "unknown";
  if (outcome === "failed" || outcome === "timed_out") {
    return {
      eventType: "agent_run.failed",
      payload: {
        failure_category: normalizeFailureCategory(
          input.errorCategory ?? (outcome === "timed_out" ? "timeout" : "unknown")
        ),
        duration_seconds: durationSeconds,
        recoverable: true,
        validation_status: validationStatus,
        tool_calls_count: state.toolCallsCount,
        handoff_saved: false
      }
    };
  }
  if (outcome === "cancelled") {
    return {
      eventType: "agent_run.cancelled",
      payload: {
        cancelled_by: "agent",
        reason_code: "user_cancelled",
        duration_seconds: durationSeconds,
        handoff_saved: false
      }
    };
  }
  return {
    eventType: "agent_run.completed",
    payload: {
      outcome: mapOutcomeToTaxonomy(outcome),
      completed_at: now.toISOString(),
      duration_seconds: durationSeconds,
      validation_status: validationStatus,
      files_touched_count: state.filesModifiedCount ?? void 0,
      tool_calls_count: state.toolCallsCount,
      failure_category: input.errorCategory ? normalizeFailureCategory(input.errorCategory) : void 0
    }
  };
}
function normalizeFailureCategory(value) {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_").replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").slice(0, 64);
  const allowed = /* @__PURE__ */ new Set([
    "validation_failed",
    "compilation_error",
    "test_failure",
    "auth_error",
    "external_service_error",
    "timeout",
    "cancelled",
    "unknown"
  ]);
  return allowed.has(normalized) ? normalized : "unknown";
}
var init_agent_run_progress = __esm({
  "src/agent-run-progress.ts"() {
    "use strict";
    init_agent();
  }
});

// src/agent-run-reporter.ts
async function reportAgentRunEventCompat(client, input) {
  try {
    const result2 = await client.reportAgentRunEvent(buildSdkEventInput(input));
    return isSuccessfulReportResult(result2);
  } catch {
    return false;
  }
}
function buildSdkEventInput(input) {
  return stripUndefined4({
    eventType: input.eventType,
    runId: input.runId,
    workspaceRef: "unknown",
    source: "claude_code",
    client: { kind: "claude_code", name: "Claude Code", version: "0.2.0" },
    actor: { kind: "agent", ref: "claude-code" },
    privacyMode: "metadata_only",
    sequence: input.sequence,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId ?? input.runId,
    proposalRef: proposalRefFor(input),
    payload: input.payload,
    progressPayload: input.progressPayload
  });
}
function proposalRefFor(input) {
  if (input.proposalRef) return input.proposalRef;
  if (input.eventType.startsWith("integration.")) return void 0;
  return input.runId;
}
function isSuccessfulReportResult(result2) {
  if (!result2 || typeof result2 !== "object") return true;
  const record = result2;
  if (!("ok" in record) && !("error" in record)) return true;
  return record.ok === true && (record.error === null || record.error === void 0);
}
function stripUndefined4(value) {
  const entries = Object.entries(value).filter(([, fieldValue]) => fieldValue !== void 0);
  return Object.fromEntries(entries);
}
var init_agent_run_reporter = __esm({
  "src/agent-run-reporter.ts"() {
    "use strict";
  }
});

// src/agent-run-events.ts
function eventKey(runId, eventType, sequence) {
  return `${runId}:${eventType}:${sequence}`;
}
async function reportRunStarted(client, input) {
  try {
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const state = await upsertRunState(input.proposalId, (current) => {
      if (current?.startedReported) return current;
      return createInitialRunState({
        proposalId: input.proposalId,
        estimatedFiles: input.estimatedFiles,
        nowIso
      });
    });
    if (state.startedReported) {
      return;
    }
    await setActiveRunForSession(input.proposalId);
    const withSequence = nextSequence(state);
    const ok = await reportAgentRunEventCompat(client, {
      runId: withSequence.runId,
      eventType: "agent_run.started",
      sequence: withSequence.sequence,
      idempotencyKey: eventKey(withSequence.runId, "agent_run.started", withSequence.sequence),
      payload: startedPayload({
        estimatedFiles: input.estimatedFiles,
        estimatedMinutes: input.estimatedMinutes
      }),
      correlationId: input.proposalId,
      proposalRef: input.proposalId
    });
    if (!ok) return;
    await upsertRunState(input.proposalId, (current) => {
      const base = current ?? withSequence;
      return {
        ...base,
        sequence: withSequence.sequence,
        startedReported: true,
        estimatedFiles: typeof input.estimatedFiles === "number" ? input.estimatedFiles : base.estimatedFiles
      };
    });
  } catch {
  }
}
async function reportRunProgress(client, input) {
  try {
    const activeRun = input.proposalId ? await getRunState(input.proposalId) : await getActiveRunStateForSession();
    if (!activeRun) return;
    const state = await upsertRunState(activeRun.runId, (current) => {
      const base = current ?? activeRun;
      return {
        ...base,
        toolCallsCount: base.toolCallsCount + 1,
        toolReadCount: base.toolReadCount + (input.toolType === "read" ? 1 : 0),
        toolWriteCount: base.toolWriteCount + (input.toolType === "write" ? 1 : 0),
        toolExternalCount: base.toolExternalCount + (input.toolType === "external" ? 1 : 0),
        filesModifiedCount: typeof input.filesModifiedCount === "number" ? Math.max(input.filesModifiedCount, base.filesModifiedCount ?? 0) : base.filesModifiedCount
      };
    });
    const withSequence = nextSequence(state);
    const ok = await reportAgentRunEventCompat(client, {
      runId: withSequence.runId,
      eventType: "agent_run.progress_reported",
      sequence: withSequence.sequence,
      idempotencyKey: eventKey(
        withSequence.runId,
        "agent_run.progress_reported",
        withSequence.sequence
      ),
      progressPayload: progressPayload(withSequence),
      correlationId: state.proposalId,
      proposalRef: state.proposalId
    });
    if (!ok) return;
    await upsertRunState(state.runId, (current) => ({
      ...current ?? withSequence,
      sequence: withSequence.sequence
    }));
  } catch {
  }
}
async function reportRunOutcome(client, input) {
  try {
    const state = await getRunState(input.proposalId);
    if (!state || state.terminalOutcome) {
      return;
    }
    const terminalState = nextSequence(state);
    const terminalEvent = buildTerminalEvent(terminalState, input.outcome, {
      errorCategory: input.errorCategory,
      testsPassed: input.testsPassed
    });
    const terminalOk = await reportAgentRunEventCompat(client, {
      runId: terminalState.runId,
      eventType: terminalEvent.eventType,
      sequence: terminalState.sequence,
      idempotencyKey: eventKey(
        terminalState.runId,
        terminalEvent.eventType,
        terminalState.sequence
      ),
      payload: terminalEvent.payload,
      correlationId: input.proposalId,
      proposalRef: input.proposalId
    });
    if (!terminalOk) return;
    await upsertRunState(input.proposalId, (current) => ({
      ...current ?? terminalState,
      sequence: terminalState.sequence,
      terminalOutcome: input.outcome
    }));
    await clearRunState(input.proposalId);
  } catch {
  }
}
async function reportRunResumed(client, input) {
  try {
    const state = await upsertRunState(input.runId, (current) => {
      if (current) return current;
      return createInitialRunState({ proposalId: input.runId, nowIso: (/* @__PURE__ */ new Date()).toISOString() });
    });
    await setActiveRunForSession(input.runId);
    const withSequence = nextSequence(state);
    const ok = await reportAgentRunEventCompat(client, {
      runId: withSequence.runId,
      eventType: "agent_run.resumed",
      sequence: withSequence.sequence,
      idempotencyKey: eventKey(withSequence.runId, "agent_run.resumed", withSequence.sequence),
      payload: {
        continuation_id: `cont_${withSequence.runId}`,
        resumed_by: "agent",
        resume_source: "manual",
        validation_status: "unknown",
        call_key: "ready_to_resume",
        action_key: "resume_run"
      },
      correlationId: input.runId,
      proposalRef: input.runId
    });
    if (!ok) return;
    await upsertRunState(input.runId, (current) => ({
      ...current ?? withSequence,
      sequence: withSequence.sequence
    }));
  } catch {
  }
}
var init_agent_run_events2 = __esm({
  "src/agent-run-events.ts"() {
    "use strict";
    init_agent_run_state();
    init_agent_run_progress();
    init_agent_run_reporter();
  }
});

// src/autopilot/wake-up-digest.ts
function detectModeTransition(prev, curr) {
  const previous = normalizeMode(prev);
  const current = normalizeMode(curr);
  if (!previous && current) return "first_observation";
  if (previous === current) return isOnlineLike(current) ? "still_online" : "still_offline";
  if (!isOnlineLike(previous) && isOnlineLike(current)) return "online_arrival";
  if (isOnlineLike(previous) && !isOnlineLike(current)) return "going_offline";
  return "no_change";
}
function shouldTriggerWakeUp(transition, currentMode) {
  return transition === "online_arrival" || transition === "first_observation" && isOnlineLike(currentMode);
}
function deferredDecisionEntryFromEvent(event) {
  const record = event;
  const payload = record.payload && typeof record.payload === "object" ? record.payload : {};
  const summary2 = payload.local_session_summary && typeof payload.local_session_summary === "object" ? payload.local_session_summary : {};
  const decisionId = stringField(payload.decision_id);
  if (!decisionId) return null;
  return {
    decisionId,
    runId: stringField(record.runId) || "unknown",
    eventId: stringField(record.eventId) || decisionId,
    decisionKind: stringField(payload.decision_kind) || "unknown",
    urgencyBucket: stringField(payload.urgency_bucket) || "normal",
    flaggedForReview: payload.flagged_for_review === true,
    outcomeCategory: stringField(summary2.outcomeCategory),
    toolCallCount: numberField(summary2.toolCallCount),
    fileChangeCount: numberField(summary2.fileChangeCount),
    deferredDecisionCount: numberField(summary2.deferredDecisionCount),
    timestamp: stringField(record.occurredAt) || stringField(record.insertedAt) || (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function summarizeWakeUpDigest(entries) {
  const summary2 = {
    count: entries.length,
    runIds: [...new Set(entries.map((entry) => entry.runId))].sort(),
    flaggedCount: entries.filter((entry) => entry.flaggedForReview).length,
    urgencyBuckets: {},
    outcomeCategoryBuckets: {},
    latestAt: null
  };
  for (const entry of entries) {
    summary2.urgencyBuckets[entry.urgencyBucket] = (summary2.urgencyBuckets[entry.urgencyBucket] ?? 0) + 1;
    if (entry.outcomeCategory) {
      summary2.outcomeCategoryBuckets[entry.outcomeCategory] = (summary2.outcomeCategoryBuckets[entry.outcomeCategory] ?? 0) + 1;
    }
    if (!summary2.latestAt || entry.timestamp > summary2.latestAt) summary2.latestAt = entry.timestamp;
  }
  return summary2;
}
function formatWakeUpDigestInstruction(summary2) {
  if (summary2.count === 0) return null;
  const decisionWord = summary2.count === 1 ? "deferred decision" : "deferred decisions";
  const runWord = summary2.runIds.length === 1 ? "run" : "runs";
  const text = [
    `[HeadsDown autopilot] ${summary2.count} unresolved ${decisionWord} across ${summary2.runIds.length} ${runWord} is ready to review.`,
    `Flagged for review: ${summary2.flaggedCount}. Urgency buckets: ${formatBuckets(summary2.urgencyBuckets)}. Outcome buckets: ${formatBuckets(summary2.outcomeCategoryBuckets)}. Latest at: ${summary2.latestAt ?? "unknown"}.`,
    "Use the headsdown_deferred tool to list, view, approve, override, refine, or dismiss entries. Show derived facts only. Do not render raw transcript text, prompts, file paths, terminal output, URLs, code snippets, or question text."
  ].join(" ");
  assertPrivacySafe({ digest_instruction: text });
  return text;
}
function unresolvedDeferredEntries(events, surfacedDecisionIds = []) {
  const resolved = /* @__PURE__ */ new Set();
  const surfaced = new Set(surfacedDecisionIds);
  const recorded = [];
  for (const event of events) {
    const record = event;
    const payload = record.payload && typeof record.payload === "object" ? record.payload : {};
    const decisionId = stringField(payload.decision_id);
    if (!decisionId) continue;
    if (record.eventType === "deferred_decision.resolved") resolved.add(decisionId);
    if (record.eventType === "deferred_decision.recorded") {
      const entry = deferredDecisionEntryFromEvent(record);
      if (entry) recorded.push(entry);
    }
  }
  return recorded.filter(
    (entry) => !resolved.has(entry.decisionId) && !surfaced.has(entry.decisionId)
  );
}
function formatBuckets(buckets) {
  const entries = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "none";
  return entries.map(([key, value]) => `${key}:${value}`).join(", ");
}
function normalizeMode(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function isOnlineLike(value) {
  return value === "online" || value === "busy";
}
function stringField(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function numberField(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
var init_wake_up_digest = __esm({
  "src/autopilot/wake-up-digest.ts"() {
    "use strict";
    init_dist();
  }
});

// src/headsdown-action-executor.ts
import { readFile as readFile5, writeFile as writeFile5, mkdir as mkdir5 } from "node:fs/promises";
import { dirname as dirname3, join as join5 } from "node:path";
import { homedir as homedir4 } from "node:os";
async function applyCanonicalAction(rawInput, deps) {
  const runId = clean(rawInput.runId);
  if (!runId) {
    return failure("missing_required_input", "run_id is required.", { field: "run_id" });
  }
  const normalizedActionCandidate = normalizeStateKey(rawInput.actionKey);
  if (!normalizedActionCandidate) {
    return failure("missing_required_input", "action_key is required.", { field: "action_key" });
  }
  if (!CANONICAL_ACTION_KEYS.includes(normalizedActionCandidate)) {
    return failure("unsupported_action", "action_key is not canonical.", {
      actionKey: normalizedActionCandidate,
      canonicalActionKeys: CANONICAL_ACTION_KEYS
    });
  }
  const normalizedAction = normalizedActionCandidate;
  if (UNSUPPORTED_CANONICAL_ACTIONS.has(normalizedAction)) {
    return failure(
      "unsupported_action",
      "Canonical action is recognized but not supported by this Claude client yet.",
      {
        actionKey: normalizedAction
      }
    );
  }
  if (ACTIONS_REQUIRING_DURATION.has(normalizedAction) && !isPositiveNumber(rawInput.durationMinutes)) {
    return failure(
      "missing_required_input",
      "duration_minutes is required and must be greater than zero for this action.",
      { field: "duration_minutes", actionKey: normalizedAction }
    );
  }
  const runActionContext = await deps.getRunActionContext(runId);
  const allowedActionKeys = canonicalAllowedActionKeys(runActionContext?.allowedActionKeys ?? null);
  if (allowedActionKeys && !allowedActionKeys.includes(normalizedAction)) {
    return failure("not_allowed", "Action is not allowed for the target HeadsDown run.", {
      actionKey: normalizedAction,
      allowedActionKeys,
      sourceState: runActionContext?.sourceState ?? null
    });
  }
  const existingMarker = await deps.markerStore.get(runId);
  const mutationInput = buildMutationInput(
    rawInput,
    normalizedAction,
    existingMarker,
    runActionContext,
    deps.now
  );
  let payload;
  try {
    payload = await deps.mutateAction(mutationInput);
  } catch (error) {
    return failure("backend_unavailable", "HeadsDown action API could not be reached.", {
      message: error instanceof Error ? error.message : String(error)
    });
  }
  const actionPayload = payload.applyHeadsdownAction ?? payload.applyHeadsDownAction;
  if (!actionPayload) {
    return failure("backend_unavailable", "HeadsDown action response was empty.", {});
  }
  const ok = actionPayload.ok === true;
  if (!ok) {
    return failure("backend_rejected", "HeadsDown rejected the action.", {
      action: actionPayload
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
    payload: actionPayload
  };
}
async function applyLocalMarkerSemantics(input, actionKey, markerStore, now) {
  const runId = clean(input.runId);
  if (!runId) return null;
  if (actionKey === "resume_run") {
    return markerStore.get(runId);
  }
  if (!isQueuedMarkerAction(actionKey)) {
    return markerStore.get(runId);
  }
  const existing = await markerStore.get(runId);
  const handoffKind = clean(input.handoffKind) ?? existing?.handoffKind ?? defaultHandoffKind(actionKey);
  const handoffState = input.handoffState ?? existing?.handoffState ?? "unknown";
  const handoffAvailable = input.handoffAvailable ?? existing?.handoffAvailable ?? handoffState === "saved";
  const handoffCapturedAt = clean(input.handoffCapturedAt) ?? existing?.handoffCapturedAt;
  const attemptByAction = {
    ...existing?.attemptByAction ?? {},
    [actionKey]: existing?.attemptByAction?.[actionKey] ?? stableLocalAttempt(input, actionKey)
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
    updatedAt: now().toISOString()
  });
}
function buildMutationInput(input, actionKey, marker, runActionContext, now) {
  const mutationInput = {
    runId: clean(input.runId),
    actionKey,
    client: "claude-code",
    source: "claude_code_mcp"
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
  const nextWorkWindowStartsAt = clean(input.nextWorkWindowStartsAt) ?? marker?.nextWorkWindowStartsAt;
  if (isQueuedMarkerAction(actionKey)) {
    const handoffState = input.handoffState ?? marker?.handoffState ?? "unknown";
    mutationInput.handoffAvailable = input.handoffAvailable ?? marker?.handoffAvailable ?? false;
    mutationInput.handoffState = toGraphQLEnum3(handoffState);
    mutationInput.handoffSource = clean(input.handoffSource) ?? marker?.handoffSource ?? "claude";
    mutationInput.handoffKind = clean(input.handoffKind) ?? marker?.handoffKind ?? defaultHandoffKind(actionKey);
    const handoffCapturedAt = clean(input.handoffCapturedAt) ?? marker?.handoffCapturedAt;
    if (handoffCapturedAt && handoffState === "saved") {
      mutationInput.handoffCapturedAt = handoffCapturedAt;
    }
    if (resumeEligibleAt) mutationInput.resumeEligibleAt = resumeEligibleAt;
    if (nextWorkWindowStartsAt) mutationInput.nextWorkWindowStartsAt = nextWorkWindowStartsAt;
  }
  return mutationInput;
}
function defaultIdempotencyKey(actionKey, input, marker, now) {
  const normalizedRunId = clean(input.runId) ?? "unknown-run";
  if (isQueuedMarkerAction(actionKey)) {
    const attempt = marker?.attemptByAction?.[actionKey] ?? marker?.attemptByAction?.queue_for_morning ?? stableLocalAttempt(input, actionKey);
    return `claude:${normalizedRunId}:${actionKey}:${attempt}`;
  }
  return `claude:${normalizedRunId}:${actionKey}:${now().toISOString()}`;
}
function stableLocalAttempt(input, actionKey) {
  const parts = [
    clean(input.runId) ?? "unknown-run",
    actionKey,
    normalizeStateKey(input.sourceState) ?? "unknown-state",
    String(input.durationMinutes ?? "no-duration"),
    clean(input.resumeEligibleAt) ?? "no-resume-at",
    clean(input.nextWorkWindowStartsAt) ?? "no-next-window",
    clean(input.handoffKind) ?? "no-handoff-kind",
    input.handoffState ?? "no-handoff-state"
  ];
  return parts.map((part) => part.replace(/[^A-Za-z0-9_.:-]+/g, "_")).join(":");
}
function defaultHandoffKind(actionKey) {
  if (actionKey === "pause_and_summarize") return "pause_summary";
  if (actionKey === "queue_for_later") return "queue_for_later";
  return "queue_for_morning";
}
function isQueuedMarkerAction(actionKey) {
  return QUEUED_MARKER_ACTIONS.has(actionKey);
}
function canonicalAllowedActionKeys(values) {
  if (!values) return null;
  return [
    ...new Set(
      values.map((value) => normalizeActionKey2(value)).filter(
        (value) => value !== null && CANONICAL_ACTION_KEYS.includes(value)
      )
    )
  ];
}
function normalizeActionKey2(value) {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const normalized = cleaned.toLowerCase().replace(/-/g, "_");
  return CANONICAL_ACTION_KEYS.includes(normalized) ? normalized : null;
}
function normalizeStateKey(value) {
  const cleaned = clean(value);
  if (!cleaned) return null;
  return cleaned.toLowerCase().replace(/-/g, "_");
}
function failure(code, message, details) {
  return {
    ok: false,
    error: {
      code,
      message,
      details
    }
  };
}
function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function copyIfPresent(target, key, value) {
  if (value) target[key] = value;
}
function toGraphQLEnum3(value) {
  return value.trim().toUpperCase().replace(/-/g, "_");
}
function clean(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
function defaultMarkerPath() {
  const override = process.env.HEADSDOWN_ACTION_MARKERS_PATH;
  const cleaned = clean(override);
  if (cleaned) return cleaned;
  return join5(homedir4(), ".config", "headsdown", "agent-control-markers.json");
}
var CANONICAL_ACTION_KEYS, UNSUPPORTED_CANONICAL_ACTIONS, ACTIONS_REQUIRING_DURATION, QUEUED_MARKER_ACTIONS, EMPTY_MARKER_STORE, LocalActionMarkerStore, APPLY_HEADSDOWN_ACTION_MUTATION2;
var init_headsdown_action_executor = __esm({
  "src/headsdown-action-executor.ts"() {
    "use strict";
    CANONICAL_ACTION_KEYS = [
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
      "keep_queued"
    ];
    UNSUPPORTED_CANONICAL_ACTIONS = /* @__PURE__ */ new Set(["create_temporary_exception"]);
    ACTIONS_REQUIRING_DURATION = /* @__PURE__ */ new Set(["allow_for_duration"]);
    QUEUED_MARKER_ACTIONS = /* @__PURE__ */ new Set([
      "queue_for_later",
      "queue_for_morning",
      "pause_and_summarize",
      "keep_queued"
    ]);
    EMPTY_MARKER_STORE = { markers: {} };
    LocalActionMarkerStore = class {
      constructor(filePath = defaultMarkerPath()) {
        this.filePath = filePath;
      }
      async get(runId) {
        const store = await this.load();
        return store.markers[runId] ?? null;
      }
      async upsert(runId, updates) {
        const store = await this.load();
        const existing = store.markers[runId];
        const merged = {
          runId,
          handoffAvailable: updates.handoffAvailable ?? existing?.handoffAvailable ?? false,
          handoffState: updates.handoffState ?? existing?.handoffState ?? "unknown",
          handoffSource: updates.handoffSource ?? existing?.handoffSource ?? "claude",
          handoffKind: updates.handoffKind ?? existing?.handoffKind ?? "checkpoint",
          handoffCapturedAt: updates.handoffCapturedAt ?? existing?.handoffCapturedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
          resumeEligibleAt: updates.resumeEligibleAt ?? existing?.resumeEligibleAt,
          nextWorkWindowStartsAt: updates.nextWorkWindowStartsAt ?? existing?.nextWorkWindowStartsAt,
          attemptByAction: updates.attemptByAction ?? existing?.attemptByAction ?? {},
          updatedAt: updates.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString()
        };
        store.markers[runId] = merged;
        await this.save(store);
        return merged;
      }
      async clear(runId) {
        const store = await this.load();
        if (store.markers[runId]) {
          delete store.markers[runId];
          await this.save(store);
        }
      }
      async listActive() {
        const store = await this.load();
        return Object.values(store.markers);
      }
      async load() {
        try {
          const raw = await readFile5(this.filePath, "utf-8");
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || typeof parsed.markers !== "object") {
            return { ...EMPTY_MARKER_STORE };
          }
          return parsed;
        } catch {
          return { ...EMPTY_MARKER_STORE };
        }
      }
      async save(payload) {
        await mkdir5(dirname3(this.filePath), { recursive: true });
        await writeFile5(this.filePath, JSON.stringify(payload, null, 2), { mode: 384 });
      }
    };
    APPLY_HEADSDOWN_ACTION_MUTATION2 = `
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
  }
});

// src/session-timebox.ts
import { readFile as readFile6, rm, writeFile as writeFile6 } from "node:fs/promises";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join6 } from "node:path";
function sessionTimeboxPromptDedupePath(sessionId) {
  const normalized = (sessionId ?? "default").replace(/[^a-zA-Z0-9._-]/g, "_");
  return join6(tmpdir2(), `headsdown-session-timebox-prompt-${normalized}.state`);
}
async function readSessionTimeboxPromptFingerprint(sessionId) {
  try {
    const value = await readFile6(sessionTimeboxPromptDedupePath(sessionId), "utf-8");
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
async function writeSessionTimeboxPromptFingerprint(sessionId, fingerprint) {
  await writeFile6(sessionTimeboxPromptDedupePath(sessionId), fingerprint, { mode: 384 });
}
async function clearSessionTimeboxPromptFingerprint(sessionId) {
  await rm(sessionTimeboxPromptDedupePath(sessionId), { force: true });
}
function emptySessionTimeboxPromptState(thresholdMinutes = DEFAULT_SESSION_TIMEBOX_THRESHOLD_MINUTES) {
  return {
    active: false,
    sessionId: null,
    timeboxExpiresAt: null,
    remainingMinutes: null,
    thresholdMinutes,
    fingerprint: null,
    choices: SESSION_TIMEBOX_CHOICES
  };
}
function resolveSessionTimeboxPrompt(input) {
  const thresholdMinutes = normalizePositiveInteger(input.thresholdMinutes) ?? DEFAULT_SESSION_TIMEBOX_THRESHOLD_MINUTES;
  const currentSessionId2 = cleanOpaqueId(input.currentSessionId);
  if (!currentSessionId2) return emptySessionTimeboxPromptState(thresholdMinutes);
  const summary2 = (input.sessionSummaries ?? []).find(
    (item) => cleanOpaqueId(item.sessionId) === currentSessionId2
  );
  const sessionId = cleanOpaqueId(summary2?.sessionId);
  const timeboxExpiresAt = cleanIsoTimestamp(summary2?.timeboxExpiresAt);
  if (!sessionId || !timeboxExpiresAt || summary2?.pendingTimeboxExtensionRequest) {
    return emptySessionTimeboxPromptState(thresholdMinutes);
  }
  const now = input.now ?? /* @__PURE__ */ new Date();
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
    choices: SESSION_TIMEBOX_CHOICES
  };
}
async function requestSessionTimeboxExtensionCompat(client, sessionId, requestedExtensionMinutes) {
  const nativeMethod = client.requestSessionTimeboxExtension;
  if (typeof nativeMethod === "function") {
    return nativeMethod.call(client, { sessionId, requestedExtensionMinutes });
  }
  const graphql = getLowLevelGraphQLClient(client);
  if (!graphql) {
    throw new Error("Session timebox extension requests require @headsdown/sdk 0.11.0 or newer.");
  }
  const response = await graphql.request(REQUEST_SESSION_TIMEBOX_EXTENSION_MUTATION2, {
    input: { sessionId, requestedExtensionMinutes }
  });
  const result2 = response.requestSessionTimeboxExtension;
  if (!result2) throw new Error("HeadsDown API returned no session timebox extension request.");
  return result2;
}
function minutesUntil(value, now) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.ceil((timestamp - now.getTime()) / 6e4));
}
function cleanIsoTimestamp(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}
function cleanOpaqueId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
function normalizePositiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
var DEFAULT_SESSION_TIMEBOX_THRESHOLD_MINUTES, SESSION_TIMEBOX_CHOICES, REQUEST_SESSION_TIMEBOX_EXTENSION_MUTATION2;
var init_session_timebox = __esm({
  "src/session-timebox.ts"() {
    "use strict";
    init_sdk_compat();
    DEFAULT_SESSION_TIMEBOX_THRESHOLD_MINUTES = 15;
    SESSION_TIMEBOX_CHOICES = [
      "Request 15 minutes",
      "Request 30 minutes",
      "Wrap up"
    ];
    REQUEST_SESSION_TIMEBOX_EXTENSION_MUTATION2 = `
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
  }
});

// src/time-box.ts
function parseTimeBoxDuration(input) {
  const normalized = input.trim().toLowerCase();
  const match = normalized.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  if (!match || !match[1] && !match[2]) {
    throw new Error("Use a duration like 30m, 45m, 1h, or 1h30m.");
  }
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  const totalMinutes = hours * MINUTES_PER_HOUR + minutes;
  if (!Number.isInteger(totalMinutes) || totalMinutes <= 0) {
    throw new Error("Use a positive duration like 30m, 45m, 1h, or 1h30m.");
  }
  return totalMinutes;
}
function createTimeBox(input) {
  const now = input.now ?? /* @__PURE__ */ new Date();
  const durationMinutes = parseTimeBoxDuration(input.durationText);
  const sessionIdHash = input.sessionIdHash.trim();
  if (!sessionIdHash) {
    throw new Error("HeadsDown box requires a session id.");
  }
  const expiresAt = new Date(now.getTime() + durationMinutes * 6e4);
  return {
    schemaVersion: 1,
    sessionIdHash,
    durationMinutes,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    source: "slash_command"
  };
}
function buildTimeBoxStatus(state, now = /* @__PURE__ */ new Date()) {
  if (!state) {
    return {
      active: false,
      state: null,
      deadlineAt: null,
      remainingMinutes: null,
      thresholdMinutes: null,
      isPastDeadline: false,
      message: "No active HeadsDown box for this session."
    };
  }
  const remainingMinutes = minutesUntil2(state.expiresAt, now);
  const thresholdMinutes = resolveTimeBoxThresholdMinutes(state.durationMinutes);
  const isPastDeadline = remainingMinutes <= 0;
  return {
    active: true,
    state,
    deadlineAt: state.expiresAt,
    remainingMinutes,
    thresholdMinutes,
    isPastDeadline,
    message: formatTimeBoxStatus(state, now)
  };
}
function formatTimeBoxConfirmation(state, now = /* @__PURE__ */ new Date()) {
  const remaining = minutesUntil2(state.expiresAt, now);
  return `HeadsDown box set for ${state.durationMinutes} minutes. Deadline: ${formatTimeBoxClock(state.expiresAt)}. Remaining minutes: ${remaining}.`;
}
function formatTimeBoxStatus(state, now = /* @__PURE__ */ new Date()) {
  const remaining = minutesUntil2(state.expiresAt, now);
  const threshold = resolveTimeBoxThresholdMinutes(state.durationMinutes);
  if (remaining <= 0) {
    return `HeadsDown box deadline passed at ${formatTimeBoxClock(state.expiresAt)}. Keep going with tighter wrap-up guidance until the box is cleared or replaced.`;
  }
  return `HeadsDown box active until ${formatTimeBoxClock(state.expiresAt)}. Remaining minutes: ${remaining}. Warning threshold minutes: ${threshold}.`;
}
function formatTimeBoxClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function resolveEffectiveAttentionWindow(input) {
  const now = input.now ?? /* @__PURE__ */ new Date();
  const backendInput = input.backend ?? null;
  if (isFullDepthSuppressedBackendWindow(backendInput)) return null;
  const backend = normalizeBackendWindow(backendInput);
  const timeBox2 = input.timeBox ?? null;
  const timeBoxWindow = timeBox2 ? normalizeTimeBoxWindow(timeBox2, now) : null;
  if (!timeBoxWindow) return backend;
  if (!backend) {
    if (!input.forceTimeBoxWarning && !isWithinWarningWindow(timeBoxWindow)) return null;
    return timeBoxWindow;
  }
  if (isTimeBoxEarlierOrEqual(backend, timeBoxWindow)) {
    return {
      ...timeBoxWindow,
      hints: mergeHints(backend.hints, timeBoxWindow.hints)
    };
  }
  return backend;
}
function isWithinWarningWindow(window) {
  if (window.remainingMinutes === null || window.thresholdMinutes === null) return false;
  return window.remainingMinutes <= window.thresholdMinutes;
}
function isTimeBoxEarlierOrEqual(backend, timeBoxWindow) {
  if (backend.deadlineAt && timeBoxWindow.deadlineAt) {
    return Date.parse(timeBoxWindow.deadlineAt) <= Date.parse(backend.deadlineAt);
  }
  if (backend.remainingMinutes !== null && timeBoxWindow.remainingMinutes !== null) {
    return timeBoxWindow.remainingMinutes <= backend.remainingMinutes;
  }
  return !!timeBoxWindow.deadlineAt && !backend.deadlineAt;
}
function normalizeBackendWindow(input) {
  if (!input || input.active === false) return null;
  const deadlineAt = normalizeIsoTimestamp(input.deadlineAt);
  const thresholdMinutes = normalizeNonNegativeFiniteNumber(input.thresholdMinutes);
  const remainingMinutes = normalizeNonNegativeFiniteNumber(input.remainingMinutes);
  const hints = normalizeHints(input.hints);
  if (!deadlineAt && thresholdMinutes === null && remainingMinutes === null && hints.length === 0) {
    return null;
  }
  const selectedMode = normalizeText(input.selectedMode);
  const backendSource = normalizeText(input.source);
  return {
    deadlineAt,
    thresholdMinutes,
    remainingMinutes,
    hints,
    source: "backend",
    ...selectedMode ? { selectedMode } : {},
    ...backendSource ? { backendSource } : {}
  };
}
function isFullDepthSuppressedBackendWindow(input) {
  if (!input) return false;
  return normalizeText(input.selectedMode) === "full_depth" || normalizeText(input.source) === "forced_full_depth";
}
function normalizeTimeBoxWindow(state, now) {
  const deadlineAt = normalizeIsoTimestamp(state.expiresAt);
  if (!deadlineAt) return null;
  return {
    deadlineAt,
    thresholdMinutes: resolveTimeBoxThresholdMinutes(state.durationMinutes),
    remainingMinutes: minutesUntil2(deadlineAt, now),
    hints: [
      "Self-declared box is active. Keep scope tight before the deadline; do not stop automatically when it passes."
    ],
    source: "time_box"
  };
}
function resolveTimeBoxThresholdMinutes(durationMinutes) {
  return Math.min(DEFAULT_TIME_BOX_THRESHOLD_MINUTES, Math.max(1, durationMinutes));
}
function minutesUntil2(value, now) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 0;
  return Math.max(0, Math.ceil((timestamp - now.getTime()) / 6e4));
}
function normalizeIsoTimestamp(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}
function normalizeNonNegativeFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function normalizeHints(values) {
  return Array.isArray(values) ? values.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean) : [];
}
function normalizeText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}
function mergeHints(first, second) {
  return [.../* @__PURE__ */ new Set([...first, ...second])];
}
var DEFAULT_TIME_BOX_THRESHOLD_MINUTES, MINUTES_PER_HOUR;
var init_time_box = __esm({
  "src/time-box.ts"() {
    "use strict";
    DEFAULT_TIME_BOX_THRESHOLD_MINUTES = 15;
    MINUTES_PER_HOUR = 60;
  }
});

// src/report-progress-response.ts
function buildReportProgressResponse(input) {
  const currentRun = resolveCurrentRunContext({
    activeRun: input.activeRun,
    overview: input.overview
  });
  const guidance = buildReportProgressGuidance({
    callKey: currentRun.callKey,
    wrapUpGuidance: input.wrapUpGuidance ?? null,
    timeBox: input.timeBox ?? null,
    now: input.now,
    overview: input.overview,
    currentSessionId: input.currentSessionId
  });
  return {
    reported: true,
    runId: currentRun.runId,
    proposalRef: currentRun.proposalRef,
    allowedActionKeys: currentRun.allowedActionKeys,
    ...guidance
  };
}
function buildReportProgressUnavailableResponse(input) {
  const currentRun = resolveCurrentRunContext({
    activeRun: input.activeRun ?? null,
    overview: input.overview ?? null
  });
  const guidance = buildReportProgressGuidance({
    callKey: currentRun.callKey,
    wrapUpGuidance: input.wrapUpGuidance ?? null,
    timeBox: input.timeBox ?? null,
    now: input.now,
    overview: input.overview ?? null,
    currentSessionId: input.currentSessionId
  });
  return {
    reported: false,
    reason: "unavailable",
    errorCategory: input.errorCategory,
    message: input.message,
    details: input.details,
    runId: currentRun.runId,
    proposalRef: currentRun.proposalRef,
    allowedActionKeys: currentRun.allowedActionKeys,
    ...guidance
  };
}
function buildReportProgressGuidance(input) {
  const backendClosing = input.callKey === "attention_window_closing" && !isFullDepthSuppressed(input.wrapUpGuidance);
  const effectiveAttentionWindow = resolveEffectiveAttentionWindow({
    backend: input.wrapUpGuidance,
    timeBox: input.timeBox,
    now: input.now,
    forceTimeBoxWarning: backendClosing
  });
  const attentionWindowClosing = !!effectiveAttentionWindow && (backendClosing || isWithinWarningWindow(effectiveAttentionWindow));
  const thresholdMinutes = effectiveAttentionWindow?.thresholdMinutes ?? input.wrapUpGuidance?.thresholdMinutes ?? null;
  const sessionTimeboxPrompt = resolveSessionTimeboxPrompt({
    sessionSummaries: input.overview?.sessionSummaries ?? null,
    currentSessionId: input.currentSessionId,
    thresholdMinutes,
    now: input.now
  });
  const promptFields = sessionTimeboxPrompt.active ? { sessionTimeboxPrompt } : {};
  return attentionWindowClosing ? {
    attentionWindowClosing: true,
    attentionWindow: buildAttentionWindowState(effectiveAttentionWindow),
    ...promptFields
  } : {
    attentionWindowClosing: false,
    attentionWindow: null,
    ...promptFields
  };
}
function resolveCurrentRunContext(input) {
  const currentRun = resolveCurrentRun(input.activeRun, input.overview?.runSummaries ?? null);
  const overviewCall = input.overview?.headsdownCall ?? null;
  const callKey = normalizeHeadsDownCallKey(currentRun?.callKey) ?? resolveOverviewCallKey(overviewCall);
  const summaryActionKeys = normalizeActionKeys2(currentRun?.allowedActionKeys ?? []);
  const overviewActionKeys = normalizeActionKeys2(
    overviewCall?.allowedActionKeys && overviewCall.allowedActionKeys.length > 0 ? overviewCall.allowedActionKeys : overviewCall?.allowedActionKnownKeys
  );
  return {
    runId: currentRun?.runId ?? input.activeRun?.runId ?? null,
    proposalRef: input.activeRun?.proposalId ?? null,
    callKey,
    allowedActionKeys: summaryActionKeys.length > 0 ? summaryActionKeys : overviewActionKeys
  };
}
function resolveCurrentRun(activeRun, runSummaries) {
  if (!runSummaries || runSummaries.length === 0) return null;
  if (activeRun) {
    return runSummaries.find(
      (run) => run.runId === activeRun.runId || run.runId === activeRun.proposalId
    ) ?? null;
  }
  const attentionWindowRuns = runSummaries.filter(
    (run) => normalizeHeadsDownCallKey(run.callKey) === "attention_window_closing"
  );
  if (attentionWindowRuns.length === 1) return attentionWindowRuns[0];
  return runSummaries[0] ?? null;
}
function resolveOverviewCallKey(call) {
  return normalizeHeadsDownCallKey(call?.knownKey) ?? normalizeHeadsDownCallKey(call?.key);
}
function isFullDepthSuppressed(input) {
  return normalizeText2(input?.selectedMode) === "full_depth" || normalizeText2(input?.source) === "forced_full_depth";
}
function buildAttentionWindowState(input) {
  return {
    deadlineAt: normalizeIsoTimestamp2(input?.deadlineAt),
    thresholdMinutes: normalizeNonNegativeFiniteNumber2(input?.thresholdMinutes),
    remainingMinutes: normalizeNonNegativeFiniteNumber2(input?.remainingMinutes),
    hints: Array.isArray(input?.hints) ? input.hints.map((hint) => typeof hint === "string" ? hint.trim() : "").filter((hint) => hint.length > 0) : [],
    source: input?.source ?? null
  };
}
function normalizeNonNegativeFiniteNumber2(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function normalizeIsoTimestamp2(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed;
}
function normalizeText2(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}
function normalizeActionKeys2(values) {
  if (!values || values.length === 0) return [];
  return [
    ...new Set(
      values.map((value) => normalizeHeadsDownCallKey(value)).filter((value) => !!value)
    )
  ];
}
function normalizeHeadsDownCallKey(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[\r\n\t]+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.replace(/([a-z\d])([A-Z])/g, "$1_$2").replace(/[\s\-]+/g, "_").toLowerCase();
}
var init_report_progress_response = __esm({
  "src/report-progress-response.ts"() {
    "use strict";
    init_session_timebox();
    init_time_box();
  }
});

// src/autopilot/deferral.ts
import { createHash as createHash2, randomBytes } from "node:crypto";
import { access as access3, readFile as readFile8 } from "node:fs/promises";
import { join as join8 } from "node:path";
import { homedir as homedir6 } from "node:os";
function shouldRecordAutopilotDeferral(input) {
  if (!input.config.enabled) {
    return { matched: false, pattern: null, urgencyBucket: input.config.defaultUrgencyBucket };
  }
  if (input.mode !== "offline" && !(input.mode === "limited" && input.config.includeLimitedMode)) {
    return { matched: false, pattern: null, urgencyBucket: input.config.defaultUrgencyBucket };
  }
  for (const pattern of input.config.patterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(input.message)) {
      return {
        matched: true,
        pattern: pattern.key,
        urgencyBucket: pattern.urgencyBucket ?? input.config.defaultUrgencyBucket
      };
    }
  }
  return { matched: false, pattern: null, urgencyBucket: input.config.defaultUrgencyBucket };
}
function buildLocalSessionSummary(input) {
  const summary2 = {
    version: LOCAL_SESSION_SUMMARY_VERSION,
    sessionId: safeSummaryToken(input.sessionId || "default"),
    generatedAt: (input.now ?? /* @__PURE__ */ new Date()).toISOString(),
    stale: input.stale ?? false,
    toolCallCount: clampCount(input.toolCallCount),
    fileChangeCount: clampCount(input.fileChangeCount),
    deferredDecisionCount: clampCount(input.deferredDecisionCount),
    continuationArtifactAvailable: Boolean(input.continuationArtifactAvailable),
    validationLocallyPassed: Boolean(input.validationLocallyPassed),
    approvedProposalRef: input.approvedProposalRef ? safeSummaryToken(input.approvedProposalRef) : null,
    outcomeCategory: input.outcomeCategory ?? "in_progress"
  };
  assertLocalSessionSummary(summary2);
  return summary2;
}
async function recordDeferredDecision(client, input) {
  assertLocalSessionSummary(input.localSessionSummary);
  const decisionId = input.decisionId ?? `decision_${randomBytes(16).toString("hex")}`;
  const payload = {
    decision_id: decisionId,
    decision_kind: "human_input_required",
    decision_category: "agent_question",
    pattern_key: input.patternKey,
    urgency_bucket: input.urgencyBucket,
    flagged_for_review: input.flagForReview,
    local_session_summary: input.localSessionSummary
  };
  assertPrivacySafe(payload, "payload");
  return await reportAgentRunEventCompat(client, {
    runId: input.runId,
    eventType: "deferred_decision.recorded",
    sequence: input.sequence ?? 0,
    idempotencyKey: input.idempotencyKey ?? `${input.runId}:deferred_decision.recorded:${decisionId}`,
    correlationId: input.runId,
    proposalRef: input.proposalRef ?? input.runId,
    payload: { ...payload }
  });
}
async function loadAutopilotDeferralConfig() {
  const configPath = autopilotConfigPath();
  try {
    await access3(configPath);
  } catch {
    return normalizeAutopilotDeferralConfig(null);
  }
  try {
    return normalizeAutopilotDeferralConfig(JSON.parse(await readFile8(configPath, "utf-8")));
  } catch {
    return normalizeAutopilotDeferralConfig(null);
  }
}
function normalizeAutopilotDeferralConfig(value) {
  const raw = value && typeof value === "object" ? value : {};
  const rawPatterns = Array.isArray(raw.patterns) ? raw.patterns : [];
  const customPatterns = rawPatterns.map((entry, index) => normalizePattern(entry, index)).filter((pattern) => pattern !== null);
  const defaultPatterns = DEFAULT_DETECTION_PATTERNS.map(
    (entry, index) => normalizePattern(entry, index)
  ).filter((pattern) => pattern !== null);
  return {
    enabled: raw.enabled === false ? false : true,
    includeLimitedMode: raw.includeLimitedMode === true,
    defaultUrgencyBucket: normalizeUrgencyBucket(raw.defaultUrgencyBucket),
    modeCacheMs: normalizePositiveNumber(raw.modeCacheMs, 6e4),
    nudgeCooldownMs: normalizePositiveNumber(raw.nudgeCooldownMs, 5e3),
    maxConsecutiveNudges: normalizeCountWithFallback(raw.maxConsecutiveNudges, 4),
    latitudeDefault: normalizeLatitude2(raw.latitudeDefault),
    identityActionOverrides: normalizeStringArray2(raw.identityActionOverrides),
    houseRules: normalizeStringArray2(raw.houseRules),
    patterns: customPatterns.length > 0 ? customPatterns : defaultPatterns
  };
}
function safeSummaryToken(value) {
  const trimmed = value.trim();
  if (!trimmed) return "h_empty";
  return `h_${createHash2("sha256").update(trimmed).digest("hex").slice(0, 40)}`;
}
function deferralKey(input) {
  const messageHash = createHash2("sha1").update(input.message.slice(0, 2e3)).digest("hex");
  const localHash = createHash2("sha1").update(`${input.turnIndex}:${input.patternKey}:${messageHash}`).digest("hex");
  return `${safeSummaryToken(input.runId)}:${localHash}`;
}
function decisionIdForDeferralKey(key) {
  return `decision_${createHash2("sha1").update(key).digest("hex").slice(0, 32)}`;
}
function buildSummaryInputFromRunState(input) {
  return {
    sessionId: input.sessionId,
    approvedProposalRef: input.approvedProposalRef,
    toolCallCount: input.runState?.toolCallsCount ?? 0,
    fileChangeCount: input.runState?.filesModifiedCount ?? 0,
    deferredDecisionCount: input.deferredDecisionCount,
    continuationArtifactAvailable: input.continuationArtifactAvailable,
    validationLocallyPassed: false,
    outcomeCategory: "in_progress",
    now: input.now
  };
}
function autopilotConfigPath() {
  const override = process.env.HEADSDOWN_AUTOPILOT_CONFIG_PATH?.trim();
  if (override) return override;
  return join8(homedir6(), ".config", "headsdown", "autopilot-config.json");
}
function normalizePattern(entry, index) {
  const record = typeof entry === "string" ? { pattern: entry } : entry;
  if (!record || typeof record !== "object") return null;
  const raw = record;
  const pattern = typeof raw.pattern === "string" ? raw.pattern : null;
  if (!pattern || !pattern.trim()) return null;
  try {
    return {
      key: typeof raw.key === "string" && raw.key.trim() ? raw.key.trim() : `custom_${index + 1}`,
      regex: new RegExp(pattern, "im"),
      urgencyBucket: normalizeOptionalUrgencyBucket(raw.urgencyBucket)
    };
  } catch {
    return null;
  }
}
function questionCategoryForPattern(patternKey) {
  if (patternKey.includes("tool") || patternKey.includes("which_would_you_prefer")) {
    return "tooling_choice";
  }
  if (patternKey.includes("confirm") || patternKey.includes("should_i")) {
    return "approval_request";
  }
  if (patternKey.includes("awaiting") || patternKey.includes("recovery")) {
    return "recovery_decision";
  }
  if (patternKey.includes("scope")) {
    return "scope_clarification";
  }
  return "approval_request";
}
function buildAskUserActionShape(input) {
  return {
    tool_kind: "interaction.ask_user",
    question_category: input.questionCategory,
    recent_tool_context: input.lastToolOutcome && input.lastToolOutcome !== "unavailable" ? {
      last_tool_kind: "bash",
      last_tool_outcome: input.lastToolOutcome,
      turns_since: input.turnsSinceTool ?? 1
    } : {
      last_tool_kind: "none",
      last_tool_outcome: "unavailable",
      turns_since: input.turnsSinceTool ?? 1
    }
  };
}
function buildClassifierPolicy(config2) {
  return {
    classifierVersion: AUTOPILOT_CLASSIFIER_VERSION,
    latitude: config2.latitudeDefault,
    escalationStrategy: ["try_alternative", "defer_to_end_of_run", "defer_for_human_review"],
    sandboxPreference: "avoid"
  };
}
function selectEscalationStep(input) {
  if (input.consecutiveNudges >= input.maxConsecutiveNudges) {
    return {
      steps: ["defer_for_human_review"],
      reasonCode: "max_consecutive_nudges_reached",
      version: {
        level: "none",
        direction: "match",
        message: "Classifier version match.",
        shouldProceed: true,
        fallbackLatitude: null
      }
    };
  }
  return computeEscalationPath({
    classifiedAction: input.classifiedAction,
    policy: input.policy,
    capabilities: input.capabilities
  });
}
function buildAntiStuckNudgeText(input) {
  const fragments = buildClassifierPromptFragments({
    latitude: input.policy.latitude,
    identityActionOverrides: input.identityActionOverrides,
    houseRules: input.houseRules
  });
  const nextStep = input.escalation.steps[0] ?? "defer_for_human_review";
  return [
    fragments.fullSystemAddendum,
    "",
    `Anti-stuck nudge: apply the policy above and continue without waiting. Classification: ${input.classifiedAction.outcome}. Escalation: ${nextStep}. Reason: ${input.escalation.reasonCode}.`,
    "Defer this question to the deferred-decision queue and continue with what you can do. Do not wait for the user.",
    "Privacy reminder: do not repeat raw question text, file paths, terminal output, URLs, code snippets, or transcript content in hosted payloads."
  ].join("\n");
}
function classifyAskUserPattern(patternKey) {
  return classifyActionShapeFallback(
    buildAskUserActionShape({ questionCategory: questionCategoryForPattern(patternKey) })
  );
}
function normalizeUrgencyBucket(value) {
  return value === "low" || value === "high" || value === "normal" ? value : "normal";
}
function normalizeOptionalUrgencyBucket(value) {
  return value === "low" || value === "high" || value === "normal" ? value : void 0;
}
function normalizePositiveNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
function normalizeCountWithFallback(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}
function normalizeLatitude2(value) {
  return value === "hold" || value === "verify" || value === "balanced" || value === "cautious" || value === "lockdown" ? value : "balanced";
}
function normalizeStringArray2(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
}
function clampCount(value) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), 1e6);
}
var DEFAULT_DETECTION_PATTERNS;
var init_deferral = __esm({
  "src/autopilot/deferral.ts"() {
    "use strict";
    init_dist();
    init_agent_run_reporter();
    DEFAULT_DETECTION_PATTERNS = [
      {
        key: "explicit_defer_marker",
        pattern: String.raw`\[(?:DEFER|NEEDS_USER|NEEDS_DECISION)\]`,
        urgencyBucket: "high"
      },
      {
        key: "should_i",
        pattern: String.raw`\bshould\s+i\b[^.!?]{0,160}\?`
      },
      {
        key: "would_you_like",
        pattern: String.raw`\bwould\s+you\s+like\b`
      },
      {
        key: "do_you_want",
        pattern: String.raw`\bdo\s+you\s+want\b`
      },
      {
        key: "awaiting",
        pattern: String.raw`\b(?:awaiting|waiting\s+for)\s+(?:your|user|human)\b`
      },
      {
        key: "let_me_know",
        pattern: String.raw`\blet\s+me\s+know\b`
      },
      {
        key: "please_confirm",
        pattern: String.raw`\bplease\s+confirm\b`
      },
      {
        key: "which_would_you_prefer",
        pattern: String.raw`\bwhich\s+would\s+you\s+prefer\b`
      },
      {
        key: "trailing_second_person_question",
        pattern: String.raw`\b(?:you|your)\b[^.!?]{0,180}\?\s*$`
      }
    ];
  }
});

// src/autopilot/anti-stuck.ts
function evaluateAntiStuck(input) {
  if (input.mode !== "offline" && !(input.mode === "limited" && input.config.includeLimitedMode)) {
    return { shouldNudge: false };
  }
  const sameStreak = input.autopilotState.lastNudgedRunId === input.runId && input.autopilotState.lastNudgedToolCallCount === input.toolCallCount;
  const consecutiveNudges = sameStreak ? input.autopilotState.consecutiveNudges : 0;
  const nowMs = (input.now ?? /* @__PURE__ */ new Date()).getTime();
  if (sameStreak && input.autopilotState.lastNudgedAt !== null && nowMs - input.autopilotState.lastNudgedAt < input.config.nudgeCooldownMs) {
    return { shouldNudge: false, recordResolution: { reasonCode: "nudge_cooldown_active" } };
  }
  const policy = input.policy ?? buildClassifierPolicy(input.config);
  const classifiedAction = input.classifiedAction ?? classifyAskUserPattern(input.matchedPattern);
  const escalation = selectEscalationStep({
    policy,
    capabilities: input.capabilities,
    classifiedAction,
    consecutiveNudges,
    maxConsecutiveNudges: input.config.maxConsecutiveNudges
  });
  if (escalation.reasonCode === "max_consecutive_nudges_reached") {
    return { shouldNudge: false, recordResolution: { reasonCode: escalation.reasonCode } };
  }
  return {
    shouldNudge: true,
    nudgeText: buildAntiStuckNudgeText({
      policy,
      classifiedAction,
      escalation,
      identityActionOverrides: policy.identityActionOverrides ?? input.config.identityActionOverrides,
      houseRules: policy.houseRules ?? input.config.houseRules
    }),
    updatedState: {
      ...input.autopilotState,
      lastNudgedAt: nowMs,
      lastNudgedRunId: input.runId,
      lastNudgedToolCallCount: input.toolCallCount,
      consecutiveNudges: consecutiveNudges + 1
    }
  };
}
var init_anti_stuck = __esm({
  "src/autopilot/anti-stuck.ts"() {
    "use strict";
    init_deferral();
  }
});

// src/autopilot/integration-capabilities.ts
function claudeCodeIntegrationCapabilities(now = /* @__PURE__ */ new Date()) {
  return {
    classifierVersion: AUTOPILOT_CLASSIFIER_VERSION,
    snapshotId: "claude-code-static-v1",
    capturedAt: now.toISOString(),
    stale: false,
    sandbox: {
      available: false,
      fsIsolation: "cwd_only",
      networkIsolation: "none",
      identityIsolation: "none"
    },
    toolKinds: ["bash", "edit", "webfetch", "mcp", "computer_use"],
    identityActionCategories: []
  };
}
var init_integration_capabilities = __esm({
  "src/autopilot/integration-capabilities.ts"() {
    "use strict";
    init_dist();
  }
});

// src/autopilot/policy.ts
function isAutopilotMode(mode, config2) {
  if (!config2.enabled) return false;
  return mode === "offline" || mode === "limited" && config2.includeLimitedMode;
}
async function loadFreshAutopilotPolicy(input) {
  if (!isAutopilotMode(input.mode, input.config)) {
    return { active: false, skippedReason: "not_autopilot" };
  }
  try {
    const policy = await fetchAutopilotPolicy(input.client, input.mode);
    return { active: true, policy };
  } catch (error) {
    return { active: true, skippedReason: "policy_unavailable", error: safeErrorMessage(error) };
  }
}
function renderAutopilotPolicyUnavailableAddendum() {
  return [
    "[HeadsDown Autopilot] Autopilot mode is active, but the hosted autopilot policy could not be loaded for this turn.",
    "Behave conservatively: continue with reversible, low-risk work only, avoid user prompts while the user is offline, and defer decisions that require human input until policy loading recovers.",
    "Do not assume permission for destructive, public, identity-bound, or irreversible actions."
  ].join("\n");
}
function renderAutopilotPromptAddendum(policy) {
  const version = evaluateClassifierVersionCompatibility({
    sdkVersion: AUTOPILOT_CLASSIFIER_VERSION,
    policyVersion: policy.classifierVersion
  });
  if (!version.shouldProceed || version.level === "error") {
    return {
      classifierVersion: policy.classifierVersion,
      mismatchLevel: version.level,
      additionalContext: [
        "[HeadsDown Autopilot] Autopilot policy could not be applied safely because the hosted classifier policy version does not match this integration.",
        `SDK classifier version: ${AUTOPILOT_CLASSIFIER_VERSION}. Policy classifier version: ${policy.classifierVersion}.`,
        `Compatibility: ${version.direction}. ${version.message}`,
        "Behave conservatively: continue with reversible, low-risk work only, avoid user prompts when offline, and defer decisions that require human input until the integration is updated."
      ].join("\n")
    };
  }
  const fragments = buildClassifierPromptFragments({
    latitude: policy.latitude,
    identityActionOverrides: policy.identityActionOverrides,
    houseRules: policy.houseRules
  });
  const warning = version.level === "warning" ? `

[HeadsDown Autopilot] ${version.message}` : "";
  return {
    additionalContext: fragments.fullSystemAddendum + warning,
    classifierVersion: policy.classifierVersion,
    mismatchLevel: version.level
  };
}
function safeErrorMessage(error) {
  return error instanceof Error && error.message.trim() ? error.message : String(error);
}
var init_policy = __esm({
  "src/autopilot/policy.ts"() {
    "use strict";
    init_dist();
  }
});

// src/autopilot/state.ts
import { access as access4, chmod, mkdir as mkdir7, readFile as readFile9, writeFile as writeFile8 } from "node:fs/promises";
import { dirname as dirname5, join as join9 } from "node:path";
import { homedir as homedir7 } from "node:os";
function autopilotStatePath() {
  const override = process.env.HEADSDOWN_AUTOPILOT_STATE_PATH?.trim();
  if (override) return override;
  return join9(homedir7(), ".config", "headsdown", "autopilot-state.json");
}
function normalizeAutopilotState(value) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    lastObservedMode: normalizeMode2(raw.lastObservedMode),
    lastNudgedAt: normalizeNullableTimestamp(raw.lastNudgedAt),
    surfacedDecisionIds: Array.isArray(raw.surfacedDecisionIds) ? raw.surfacedDecisionIds.filter((id) => typeof id === "string") : [],
    deferredDecisionCount: normalizeCount(raw.deferredDecisionCount),
    consecutiveNudges: normalizeCount(raw.consecutiveNudges),
    lastNudgedRunId: typeof raw.lastNudgedRunId === "string" && raw.lastNudgedRunId.trim() ? raw.lastNudgedRunId.trim() : null,
    lastNudgedToolCallCount: typeof raw.lastNudgedToolCallCount === "number" && Number.isFinite(raw.lastNudgedToolCallCount) && raw.lastNudgedToolCallCount >= 0 ? Math.floor(raw.lastNudgedToolCallCount) : null,
    lastSeenDeferralKey: typeof raw.lastSeenDeferralKey === "string" && raw.lastSeenDeferralKey.trim() ? raw.lastSeenDeferralKey.trim() : null,
    modeCachedAt: normalizeNullableTimestamp(raw.modeCachedAt),
    modeCacheValue: normalizeMode2(raw.modeCacheValue)
  };
}
function normalizeMode2(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function normalizeNullableTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function normalizeCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}
var DEFAULT_AUTOPILOT_STATE, AutopilotStateStore;
var init_state = __esm({
  "src/autopilot/state.ts"() {
    "use strict";
    DEFAULT_AUTOPILOT_STATE = {
      lastObservedMode: null,
      lastNudgedAt: null,
      surfacedDecisionIds: [],
      deferredDecisionCount: 0,
      consecutiveNudges: 0,
      lastNudgedRunId: null,
      lastNudgedToolCallCount: null,
      lastSeenDeferralKey: null,
      modeCachedAt: null,
      modeCacheValue: null
    };
    AutopilotStateStore = class {
      constructor(path = autopilotStatePath()) {
        this.path = path;
      }
      async load() {
        try {
          await access4(this.path);
        } catch {
          return { ...DEFAULT_AUTOPILOT_STATE, surfacedDecisionIds: [] };
        }
        try {
          const raw = await readFile9(this.path, "utf-8");
          return normalizeAutopilotState(JSON.parse(raw));
        } catch {
          return { ...DEFAULT_AUTOPILOT_STATE, surfacedDecisionIds: [] };
        }
      }
      async save(state) {
        await mkdir7(dirname5(this.path), { recursive: true });
        await writeFile8(this.path, JSON.stringify(normalizeAutopilotState(state), null, 2), {
          mode: 384
        });
        await chmod(this.path, 384).catch(() => void 0);
      }
      async update(updater) {
        const next = normalizeAutopilotState(updater(await this.load()));
        await this.save(next);
        return next;
      }
    };
  }
});

// src/autopilot/detect-deferral-handler.ts
import { open, access as access5 } from "node:fs/promises";
import { join as join10 } from "node:path";
import { homedir as homedir8 } from "node:os";
async function runDetectDeferralFromStdin() {
  const raw = await readStdin();
  if (!raw.trim()) return { recorded: false, skippedReason: "empty_input" };
  try {
    const result2 = await handleDetectDeferral(JSON.parse(raw));
    if (result2.stderr) console.error(result2.stderr);
    if (result2.exitCode && result2.exitCode !== 0) process.exit(result2.exitCode);
    return result2;
  } catch {
    return { recorded: false, skippedReason: "invalid_input" };
  }
}
async function handleDetectDeferral(input, options = {}) {
  const transcriptPath = typeof input.transcript_path === "string" ? input.transcript_path : null;
  if (!transcriptPath) return { recorded: false, skippedReason: "missing_transcript" };
  const config2 = await (options.configLoader ?? loadAutopilotDeferralConfig)();
  if (!config2.enabled) return { recorded: false, skippedReason: "disabled" };
  const stateStore = options.stateStore ?? new AutopilotStateStore();
  const client = await resolveClient(options).catch(() => null);
  if (!client) return { recorded: false, skippedReason: "client_unavailable" };
  const now = options.now ?? /* @__PURE__ */ new Date();
  const mode = await resolveMode({ client, stateStore, config: config2, now }).catch(() => null);
  if (!mode) return { recorded: false, skippedReason: "mode_unavailable" };
  const lastTurn = await readLastAssistantTurn(transcriptPath).catch(() => null);
  if (!lastTurn || !lastTurn.message.trim()) {
    return { recorded: false, skippedReason: "no_assistant_message" };
  }
  const detection = shouldRecordAutopilotDeferral({
    message: lastTurn.message,
    mode,
    config: config2
  });
  if (!detection.matched || !detection.pattern) {
    return { recorded: false, skippedReason: "no_match" };
  }
  const sessionId = typeof input.session_id === "string" ? input.session_id : process.env.CLAUDE_SESSION_ID;
  const activeRun = await (options.activeRunLoader ?? getActiveRunStateForSession)(sessionId).catch(
    () => null
  );
  const runId = safeEventToken(activeRun?.runId ?? sessionId ?? "default");
  const seenKey = deferralKey({
    runId,
    turnIndex: lastTurn.turnIndex,
    patternKey: detection.pattern,
    message: lastTurn.message
  });
  const currentState = await stateStore.load();
  if (currentState.lastSeenDeferralKey === seenKey) {
    return {
      recorded: false,
      skippedReason: "duplicate",
      matchedPattern: detection.pattern,
      duplicate: true
    };
  }
  const approvedProposalRef = activeRun?.proposalId ?? await latestApprovedProposalRef(options.proposalStore);
  const eventRunId = activeRun?.runId ?? approvedProposalRef ?? runId;
  const sequence = (activeRun?.sequence ?? 0) + currentState.deferredDecisionCount + 1;
  const decisionId = decisionIdForDeferralKey(seenKey);
  const localSessionSummary = buildLocalSessionSummary(
    buildSummaryInputFromRunState({
      sessionId,
      runState: activeRun,
      approvedProposalRef,
      deferredDecisionCount: currentState.deferredDecisionCount + 1,
      continuationArtifactAvailable: await continuationArtifactExists(options.continuationPath),
      now
    })
  );
  const recorded = await recordDeferredDecision(client, {
    runId: eventRunId,
    sequence,
    proposalRef: approvedProposalRef ? safeSummaryToken(approvedProposalRef) : eventRunId,
    patternKey: detection.pattern,
    urgencyBucket: detection.urgencyBucket,
    flagForReview: detection.urgencyBucket === "high",
    localSessionSummary,
    decisionId,
    idempotencyKey: `${eventRunId}:deferred_decision.recorded:${decisionId}`
  });
  if (!recorded)
    return { recorded: false, skippedReason: "record_failed", matchedPattern: detection.pattern };
  if (activeRun) {
    await upsertRunState(activeRun.runId, (current) => ({
      ...current ?? activeRun,
      sequence
    })).catch(() => void 0);
  }
  const policyLoad = await loadFreshAutopilotPolicy({ client, mode, config: config2 });
  if (policyLoad.active && !policyLoad.policy) {
    console.error(
      "[HeadsDown autopilot] Hosted autopilot policy unavailable; using local fallback policy for this anti-stuck nudge."
    );
  }
  const antiStuck = evaluateAntiStuck({
    stopHookInput: input,
    mode,
    policy: policyLoad.policy,
    capabilities: claudeCodeIntegrationCapabilities(now),
    matchedPattern: detection.pattern,
    autopilotState: currentState,
    config: config2,
    runId: eventRunId,
    toolCallCount: activeRun?.toolCallsCount ?? 0,
    now
  });
  await stateStore.update((state) => ({
    ...antiStuck.shouldNudge ? antiStuck.updatedState : state,
    deferredDecisionCount: state.deferredDecisionCount + 1,
    lastSeenDeferralKey: seenKey
  }));
  if (antiStuck.shouldNudge) {
    return {
      recorded: true,
      matchedPattern: detection.pattern,
      stderr: antiStuck.nudgeText,
      exitCode: 2
    };
  }
  return { recorded: true, matchedPattern: detection.pattern };
}
async function readLastAssistantTurn(path) {
  const text = await readTranscriptTail(path);
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    try {
      const parsed = JSON.parse(line);
      const candidate = extractAssistantTurn(parsed, index);
      if (candidate) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}
function extractAssistantText(message) {
  if (!message || typeof message !== "object") return "";
  const record = message;
  const content = record.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (!part || typeof part !== "object") return "";
    const partRecord = part;
    return typeof partRecord.text === "string" ? partRecord.text : "";
  }).filter((part) => part.length > 0).join("\n");
}
async function resolveClient(options) {
  if (options.client) return options.client;
  if (options.clientFactory) return await options.clientFactory();
  const client = await HeadsDownClient.fromCredentials();
  const actorContext = {
    source: "claude-code",
    agentId: "claude-code:autopilot-detect-deferral",
    sessionId: process.env.CLAUDE_SESSION_ID,
    workspaceRef: "unknown"
  };
  return client.withActor(actorContext);
}
async function resolveMode(input) {
  const state = await input.stateStore.load();
  const nowMs = input.now.getTime();
  if (state.modeCachedAt !== null && state.modeCacheValue !== null && nowMs - state.modeCachedAt < input.config.modeCacheMs) {
    return state.modeCacheValue;
  }
  const availability = await input.client.getAvailability();
  const mode = normalizeMode3(availability.contract?.mode);
  await input.stateStore.update((current) => ({
    ...current,
    lastObservedMode: mode,
    modeCachedAt: nowMs,
    modeCacheValue: mode
  }));
  return mode;
}
function extractAssistantTurn(record, fallbackTurnIndex) {
  const nestedMessage = record.message && typeof record.message === "object" ? record.message : null;
  const message = nestedMessage ?? record;
  const role = typeof message.role === "string" ? message.role : record.type;
  if (role !== "assistant") return null;
  const text = extractAssistantText(message);
  if (!text.trim()) return null;
  const rawTurnIndex = record.turnIndex ?? record.turn_index ?? message.turnIndex ?? message.turn_index;
  const turnIndex = typeof rawTurnIndex === "number" && Number.isInteger(rawTurnIndex) && rawTurnIndex >= 0 ? rawTurnIndex : fallbackTurnIndex;
  return { message: text, turnIndex };
}
async function readTranscriptTail(path) {
  const file = await open(path, "r");
  try {
    const stats = await file.stat();
    const length = Math.min(stats.size, MAX_TRANSCRIPT_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, Math.max(0, stats.size - length));
    return buffer.toString("utf-8");
  } finally {
    await file.close();
  }
}
async function latestApprovedProposalRef(store) {
  try {
    const proposal = await (store ?? new ProposalStateStore()).getLatestApproved();
    return proposal?.id ?? null;
  } catch {
    return null;
  }
}
async function continuationArtifactExists(path = defaultContinuationPath()) {
  try {
    await access5(path);
    return true;
  } catch {
    return false;
  }
}
function defaultContinuationPath() {
  const override = process.env.HEADSDOWN_CONTINUATION_PATH?.trim();
  if (override) return override;
  return join10(homedir8(), ".config", "headsdown", "continuation.json");
}
function safeEventToken(value) {
  return /^[A-Za-z0-9_.:-]{1,256}$/.test(value) ? value : safeSummaryToken(value);
}
function normalizeMode3(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}
var MAX_TRANSCRIPT_TAIL_BYTES;
var init_detect_deferral_handler = __esm({
  "src/autopilot/detect-deferral-handler.ts"() {
    "use strict";
    init_dist();
    init_agent_run_state();
    init_anti_stuck();
    init_integration_capabilities();
    init_deferral();
    init_policy();
    init_state();
    MAX_TRANSCRIPT_TAIL_BYTES = 1024 * 1024;
  }
});

// src/autopilot/intercept-ask-handler.ts
async function runInterceptAskFromStdin() {
  const raw = await readStdin2();
  if (!raw.trim()) return { denied: false, recorded: false, skippedReason: "empty_input" };
  try {
    const result2 = await handleInterceptAsk(JSON.parse(raw));
    if (result2.output) console.log(JSON.stringify(result2.output));
    return result2;
  } catch {
    return { denied: false, recorded: false, skippedReason: "invalid_input" };
  }
}
async function handleInterceptAsk(input, options = {}) {
  if (input.tool_name !== "AskUserQuestion") {
    return { denied: false, recorded: false, skippedReason: "not_ask_user_question" };
  }
  const config2 = await (options.configLoader ?? loadAutopilotDeferralConfig)();
  if (!config2.enabled) return { denied: false, recorded: false, skippedReason: "disabled" };
  const stateStore = options.stateStore ?? new AutopilotStateStore();
  const client = await resolveClient2(options).catch(() => null);
  if (!client) return { denied: false, recorded: false, skippedReason: "client_unavailable" };
  const now = options.now ?? /* @__PURE__ */ new Date();
  const mode = await resolveMode2({ client, stateStore, config: config2, now }).catch(() => null);
  if (mode !== "offline" && !(mode === "limited" && config2.includeLimitedMode)) {
    return { denied: false, recorded: false, skippedReason: "not_autopilot" };
  }
  const sessionId = typeof input.session_id === "string" ? input.session_id : process.env.CLAUDE_SESSION_ID;
  const activeRun = await (options.activeRunLoader ?? getActiveRunStateForSession)(sessionId).catch(
    () => null
  );
  const latestProposalRef = activeRun?.proposalId ?? await latestApprovedProposalRef2(options.proposalStore);
  const runId = activeRun?.runId ?? latestProposalRef ?? safeSummaryToken(sessionId ?? "default");
  const questionCount = extractQuestionCount(input.tool_input);
  const patternKey = "ask_user_question";
  const localQuestionFingerprint = buildLocalQuestionFingerprint(input.tool_input);
  const seenKey = deferralKey({
    runId,
    turnIndex: questionCount,
    patternKey,
    message: `ask_user:${questionCount}:${localQuestionFingerprint}`
  });
  const currentState = await stateStore.load();
  let recorded = false;
  let skippedReason;
  if (currentState.lastSeenDeferralKey !== seenKey) {
    const decisionId = decisionIdForDeferralKey(seenKey);
    const sequence = (activeRun?.sequence ?? 0) + currentState.deferredDecisionCount + 1;
    const localSessionSummary = buildLocalSessionSummary(
      buildSummaryInputFromRunState({
        sessionId,
        runState: activeRun,
        approvedProposalRef: latestProposalRef,
        deferredDecisionCount: currentState.deferredDecisionCount + 1,
        continuationArtifactAvailable: false,
        now
      })
    );
    recorded = await recordDeferredDecision(client, {
      runId,
      sequence,
      proposalRef: latestProposalRef ? safeSummaryToken(latestProposalRef) : runId,
      patternKey,
      urgencyBucket: "normal",
      flagForReview: false,
      localSessionSummary,
      decisionId,
      idempotencyKey: `${runId}:deferred_decision.recorded:${decisionId}`
    });
    if (recorded) {
      if (activeRun) {
        await upsertRunState(activeRun.runId, (current) => ({
          ...current ?? activeRun,
          sequence
        })).catch(() => void 0);
      }
      await stateStore.update((state) => ({
        ...state,
        deferredDecisionCount: state.deferredDecisionCount + 1,
        lastSeenDeferralKey: seenKey
      }));
    } else {
      skippedReason = "record_failed";
    }
  } else {
    skippedReason = "duplicate";
  }
  if (skippedReason === "record_failed") {
    return { denied: false, recorded: false, skippedReason };
  }
  return { denied: true, recorded, skippedReason, output: denyOutput() };
}
function denyOutput() {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: DENY_REASON
    }
  };
}
async function resolveClient2(options) {
  if (options.client) return options.client;
  if (options.clientFactory) return await options.clientFactory();
  const client = await HeadsDownClient.fromCredentials();
  const actorContext = {
    source: "claude-code",
    agentId: "claude-code:autopilot-intercept-ask",
    sessionId: process.env.CLAUDE_SESSION_ID,
    workspaceRef: "unknown"
  };
  return client.withActor(actorContext);
}
async function resolveMode2(input) {
  const state = await input.stateStore.load();
  const nowMs = input.now.getTime();
  if (state.modeCachedAt !== null && state.modeCacheValue !== null && nowMs - state.modeCachedAt < input.config.modeCacheMs) {
    return state.modeCacheValue;
  }
  const availability = await input.client.getAvailability();
  const mode = normalizeMode4(availability.contract?.mode);
  await input.stateStore.update((current) => ({
    ...current,
    lastObservedMode: mode,
    modeCachedAt: nowMs,
    modeCacheValue: mode
  }));
  return mode;
}
async function latestApprovedProposalRef2(store) {
  try {
    const proposal = await (store ?? new ProposalStateStore()).getLatestApproved();
    return proposal?.id ?? null;
  } catch {
    return null;
  }
}
function buildLocalQuestionFingerprint(toolInput) {
  try {
    return JSON.stringify(toolInput ?? null).slice(0, 2e3);
  } catch {
    return "unserializable";
  }
}
function extractQuestionCount(toolInput) {
  const record = toolInput && typeof toolInput === "object" ? toolInput : {};
  const questions = record.questions;
  return Array.isArray(questions) ? questions.length : 0;
}
function normalizeMode4(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
async function readStdin2() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}
var DENY_REASON;
var init_intercept_ask_handler = __esm({
  "src/autopilot/intercept-ask-handler.ts"() {
    "use strict";
    init_dist();
    init_agent_run_state();
    init_deferral();
    init_state();
    DENY_REASON = "[HeadsDown autopilot] Defer this question to the deferred-decision queue and continue with what you can do. Do not call AskUserQuestion.";
  }
});

// src/autopilot/prompt-handler.ts
async function runAutopilotPromptFromStdin(args = process.argv.slice(4)) {
  const raw = await readStdin3();
  const input = parseHookInput(raw);
  const result2 = await handleAutopilotPrompt(input, {
    asSessionContext: args.includes("--as-session-context")
  });
  if (result2.output) {
    process.stdout.write(`${JSON.stringify(result2.output)}
`);
  }
}
async function handleAutopilotPrompt(input, options = {}) {
  const config2 = await (options.configLoader ?? loadAutopilotDeferralConfig)();
  if (!config2.enabled) return { injected: false, skippedReason: "disabled" };
  const client = await resolveClient3(input, options).catch(() => null);
  if (!client) return { injected: false, skippedReason: "client_unavailable" };
  const stateStore = options.stateStore ?? new AutopilotStateStore();
  const mode = await resolveMode3({
    client,
    stateStore,
    config: config2,
    now: options.now ?? /* @__PURE__ */ new Date()
  }).catch(() => null);
  if (!mode) return { injected: false, skippedReason: "mode_unavailable" };
  const policyLoad = await loadFreshAutopilotPolicy({ client, mode, config: config2 });
  if (!policyLoad.active) {
    return {
      injected: false,
      skippedReason: policyLoad.skippedReason ?? "not_autopilot",
      mode
    };
  }
  const hookEventName = options.asSessionContext ? "SessionStart" : "UserPromptSubmit";
  if (!policyLoad.policy) {
    return {
      injected: true,
      skippedReason: policyLoad.skippedReason ?? "policy_unavailable",
      mode,
      mismatchLevel: "error",
      output: buildHookOutput(hookEventName, renderAutopilotPolicyUnavailableAddendum())
    };
  }
  const rendered = renderAutopilotPromptAddendum(policyLoad.policy);
  return {
    injected: true,
    mode,
    classifierVersion: rendered.classifierVersion,
    mismatchLevel: rendered.mismatchLevel,
    output: buildHookOutput(hookEventName, rendered.additionalContext)
  };
}
function buildHookOutput(hookEventName, additionalContext) {
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext
    }
  };
}
async function resolveClient3(input, options) {
  if (options.client) return options.client;
  if (options.clientFactory) return await options.clientFactory();
  const client = await HeadsDownClient.fromCredentials();
  const actorContext = {
    source: "claude-code",
    agentId: "claude-code:autopilot-prompt",
    sessionId: typeof input.session_id === "string" ? input.session_id : process.env.CLAUDE_SESSION_ID,
    workspaceRef: "unknown"
  };
  return client.withActor(actorContext);
}
async function resolveMode3(input) {
  const state = await input.stateStore.load();
  const nowMs = input.now.getTime();
  if (state.modeCachedAt !== null && state.modeCacheValue !== null && nowMs - state.modeCachedAt < input.config.modeCacheMs) {
    return state.modeCacheValue;
  }
  const availability = await input.client.getAvailability();
  const mode = normalizeMode5(availability.contract?.mode);
  await input.stateStore.update((current) => ({
    ...current,
    lastObservedMode: mode,
    modeCachedAt: nowMs,
    modeCacheValue: mode
  }));
  return mode;
}
function parseHookInput(raw) {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function normalizeMode5(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
async function readStdin3() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}
var init_prompt_handler = __esm({
  "src/autopilot/prompt-handler.ts"() {
    "use strict";
    init_dist();
    init_deferral();
    init_state();
    init_policy();
  }
});

// src/autopilot/wake-up-handler.ts
async function runWakeUpFromStdin() {
  await readStdin4();
  const result2 = await handleWakeUp();
  if (result2.output) console.log(JSON.stringify(result2.output));
  return result2;
}
async function handleWakeUp(options = {}) {
  const config2 = await (options.configLoader ?? loadAutopilotDeferralConfig)();
  const stateStore = options.stateStore ?? new AutopilotStateStore();
  const client = await resolveClient4(options).catch(() => null);
  if (!client) return { emitted: false, skippedReason: "client_unavailable" };
  const now = options.now ?? /* @__PURE__ */ new Date();
  const mode = await resolveMode4({ client, stateStore, config: config2, now }).catch(() => null);
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
      .../* @__PURE__ */ new Set([...current.surfacedDecisionIds, ...entries.map((entry) => entry.decisionId)])
    ]
  }));
  if (!instruction) return { emitted: false, skippedReason: "empty" };
  return {
    emitted: true,
    output: {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: instruction
      }
    }
  };
}
async function resolveClient4(options) {
  if (options.client) return options.client;
  if (options.clientFactory) return await options.clientFactory();
  const client = await HeadsDownClient.fromCredentials();
  const actorContext = {
    source: "claude-code",
    agentId: "claude-code:autopilot-wake-up",
    sessionId: process.env.CLAUDE_SESSION_ID,
    workspaceRef: "unknown"
  };
  return client.withActor(actorContext);
}
async function resolveMode4(input) {
  const nowMs = input.now.getTime();
  const availability = await input.client.getAvailability();
  const mode = normalizeMode6(availability.contract?.mode);
  await input.stateStore.update((current) => ({
    ...current,
    lastObservedMode: current.lastObservedMode,
    modeCachedAt: nowMs,
    modeCacheValue: mode
  }));
  return mode;
}
function normalizeMode6(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
async function readStdin4() {
  const chunks = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8");
}
var init_wake_up_handler = __esm({
  "src/autopilot/wake-up-handler.ts"() {
    "use strict";
    init_dist();
    init_deferral();
    init_state();
    init_wake_up_digest();
  }
});

// src/autopilot/cli.ts
async function autopilotCli(action = process.argv[3]) {
  switch (action) {
    case "detect-deferral":
      await runDetectDeferralFromStdin();
      return;
    case "intercept-ask":
      await runInterceptAskFromStdin();
      return;
    case "prompt":
      await runAutopilotPromptFromStdin();
      return;
    case "wake-up":
      await runWakeUpFromStdin();
      return;
    default:
      process.exit(1);
  }
}
var init_cli = __esm({
  "src/autopilot/cli.ts"() {
    "use strict";
    init_detect_deferral_handler();
    init_intercept_ask_handler();
    init_prompt_handler();
    init_wake_up_handler();
  }
});

// src/hooks/runtime.ts
import { spawn } from "node:child_process";
import { readFile as readFile10, writeFile as writeFile9 } from "node:fs/promises";
async function readStdin5() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}
function parseJsonObject(input) {
  try {
    const parsed = JSON.parse(input || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function defaultCliPath() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return null;
  return `${pluginRoot}/dist/cli.js`;
}
function createCliRunner(cliPath = defaultCliPath()) {
  return async (args, input) => {
    if (!cliPath) return { code: 1, stdout: "", stderr: "" };
    return await new Promise((resolve2, reject) => {
      const child = spawn(process.execPath, [cliPath, ...args], {
        stdio: [input === void 0 ? "ignore" : "pipe", "pipe", "pipe"],
        env: process.env
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.setEncoding("utf-8");
      child.stderr?.setEncoding("utf-8");
      child.stdout?.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => resolve2({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
      if (input !== void 0) child.stdin?.end(input);
    });
  };
}
async function runCliJson(runner, args, fallback) {
  const result2 = await runner(args);
  if (result2.code !== 0 || !result2.stdout) return fallback;
  try {
    return JSON.parse(result2.stdout);
  } catch {
    return fallback;
  }
}
function outputJson(payload) {
  if (payload === void 0 || payload === null) return;
  process.stdout.write(`${JSON.stringify(payload)}
`);
}
function asRecord3(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function stringField2(value) {
  return typeof value === "string" && value !== "null" ? value : "";
}
function boolField(value) {
  return value === true;
}
function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
async function readCounter(path) {
  try {
    const value = (await readFile10(path, "utf-8")).trim();
    return /^\d+$/.test(value) ? Number.parseInt(value, 10) : 0;
  } catch {
    return 0;
  }
}
async function writeCounter(path, value) {
  await writeFile9(path, String(value));
}
var init_runtime = __esm({
  "src/hooks/runtime.ts"() {
    "use strict";
  }
});

// src/hooks/post-tool-use.ts
import { tmpdir as tmpdir3 } from "node:os";
import { join as join11 } from "node:path";
async function postToolUseHandler(input, runner) {
  const hookInput = parseJsonObject(input);
  const toolName = stringField2(hookInput.tool_name) || stringField2(hookInput.toolName);
  const toolType = classifyTool(toolName);
  const sessionId = process.env.CLAUDE_SESSION_ID || "default";
  const counterFile = join11(tmpdir3(), `headsdown-file-count-${sessionId}`);
  const current = await readCounter(counterFile);
  const count = toolType === "write" ? current + 1 : current;
  if (toolType === "write") await writeCounter(counterFile, count);
  const proposal = asRecord3(await runCliJson(runner, ["proposals"], null));
  const estimatedFiles = integerField(proposal?.estimatedFiles) ?? 0;
  const progress = await runProgress(runner, toolType, count);
  let message = `[HeadsDown] ${count} file(s) modified this session.`;
  let emitSystemMessage = toolType === "write";
  const contexts = [];
  if (estimatedFiles > 0 && count > Math.floor(estimatedFiles * 3 / 2)) {
    message += ` Scope warning: approved proposal estimated ${estimatedFiles} file(s), ${count} have been modified. Consider calling headsdown_propose with updated estimates.`;
  }
  const progressRecord = asRecord3(progress.payload);
  if (progressRecord && boolField(progressRecord.attentionWindowClosing)) {
    const attentionWindow = asRecord3(progressRecord.attentionWindow);
    const allowedActions = arrayOfStrings(progressRecord.allowedActionKeys);
    const runId = stringField2(progressRecord.runId);
    const source = stringField2(attentionWindow?.source);
    const deadlineAt = stringField2(attentionWindow?.deadlineAt);
    const thresholdMinutes = stringValue(attentionWindow?.thresholdMinutes);
    const remainingMinutes = stringValue(attentionWindow?.remainingMinutes);
    const hintsText = arrayOfStrings(attentionWindow?.hints).join("; ");
    const wrapSupported = allowedActions.includes("pause_and_summarize");
    if (source === "time_box" && !wrapSupported) {
      const parts = [
        "HeadsDown box warning: a self-declared local box deadline is active. Keep scope tight before the deadline; the box will not stop work automatically when it passes. Use /headsdown:timebox clear to clear it or /headsdown:timebox <duration> to replace it."
      ];
      appendLabeled(parts, "Deadline", deadlineAt);
      appendLabeled(parts, "Remaining minutes", remainingMinutes);
      appendLabeled(parts, "Warning threshold minutes", thresholdMinutes);
      appendLabeled(parts, "Current box hints", hintsText);
      contexts.push(parts.join(" "));
      if (toolType === "write") {
        message += " Box deadline is near. Use /headsdown:timebox clear to clear it or /headsdown:timebox <duration> to replace it.";
      }
    } else {
      const parts = [
        "HeadsDown call: Window closing. Do not autonomously call headsdown_apply_action with action_key pause_and_summarize for this call. The user must invoke /headsdown:wrap explicitly. Session timebox extension requests are handled only by the session timebox prompt."
      ];
      if (runId) {
        parts.push(`Target run_id: ${runId}.`);
      } else {
        parts.push(
          "If run_id is missing, call headsdown_status to re-establish the target run before applying actions."
        );
      }
      if (wrapSupported) parts.push("Wrap action is currently allowed.");
      if (source === "time_box") parts.push("Active box deadline is driving this warning.");
      appendLabeled(parts, "Deadline", deadlineAt);
      appendLabeled(parts, "Remaining minutes", remainingMinutes);
      appendLabeled(parts, "Warning threshold minutes", thresholdMinutes);
      appendLabeled(parts, "Current wrap-up hints", hintsText);
      contexts.push(parts.join(" "));
      if (toolType === "write") {
        message += " Window closing is active. Use /headsdown:wrap to pause and summarize if you want to stop here.";
      }
    }
  }
  const sessionTimeboxContext = await buildSessionTimeboxPromptContext(progressRecord, sessionId);
  if (sessionTimeboxContext) {
    contexts.push(sessionTimeboxContext);
    if (toolType === "write") {
      message += " Session timebox is closing. Ask whether to request 15 minutes, request 30 minutes, or wrap up.";
    }
  }
  appendWarning(contexts, progressRecord, "timeBoxError", (value) => {
    if (toolType === "write") {
      message += " HeadsDown box state could not be read. Use /headsdown:timebox clear or /headsdown:timebox <duration> to replace it.";
    }
    return `HeadsDown box state warning: ${value}. Use /headsdown:timebox clear to clear local box state or /headsdown:timebox <duration> to replace it.`;
  });
  appendWarning(
    contexts,
    progressRecord,
    "availabilityError",
    (value) => `HeadsDown availability warning: ${value} Attention-window guidance may be incomplete until the next successful status check.`
  );
  appendWarning(
    contexts,
    progressRecord,
    "progressReportError",
    (value) => `HeadsDown progress telemetry warning: ${value} Attention-window guidance is still available, but progress telemetry may be stale.`
  );
  if (progress.error) {
    contexts.push(
      `HeadsDown progress command warning: ${progress.error} Attention-window guidance may be incomplete until the command succeeds.`
    );
  }
  if (progressRecord && progressRecord.reported === false) {
    let warning = `HeadsDown progress reporting warning: ${stringField2(progressRecord.message) || "progress reporting is unavailable."}`;
    const details = stringField2(progressRecord.details);
    if (details) warning += ` Details: ${details}.`;
    contexts.push(warning);
  }
  const additionalContext = contexts.filter(Boolean).join(" ");
  if (emitSystemMessage && additionalContext) {
    return {
      systemMessage: message,
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext }
    };
  }
  if (emitSystemMessage) return { systemMessage: message };
  if (additionalContext)
    return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext } };
  return void 0;
}
function classifyTool(toolName) {
  if (["Read", "Grep", "Glob", "LS"].includes(toolName)) return "read";
  if (["Write", "Edit", "MultiEdit"].includes(toolName)) return "write";
  return "external";
}
async function runProgress(runner, toolType, count) {
  const result2 = await runner(["report-progress", toolType, String(count)]);
  if (result2.code !== 0) {
    return {
      payload: null,
      error: ["HeadsDown progress command failed.", result2.stderr].filter(Boolean).join(" ")
    };
  }
  if (!result2.stdout) return { payload: null, error: "" };
  try {
    return { payload: JSON.parse(result2.stdout), error: "" };
  } catch {
    return { payload: null, error: "HeadsDown progress command returned invalid JSON." };
  }
}
async function buildSessionTimeboxPromptContext(progressRecord, claudeSessionId) {
  const prompt = asRecord3(progressRecord?.sessionTimeboxPrompt);
  if (!prompt || !boolField(prompt.active)) return null;
  const sessionId = stringField2(prompt.sessionId);
  const fingerprint = stringField2(prompt.fingerprint);
  if (!sessionId || !fingerprint) return null;
  const previousFingerprint = await readSessionTimeboxPromptFingerprint(claudeSessionId);
  if (previousFingerprint === fingerprint) return null;
  await writeSessionTimeboxPromptFingerprint(claudeSessionId, fingerprint);
  const remainingMinutes = stringValue(prompt.remainingMinutes);
  const thresholdMinutes = stringValue(prompt.thresholdMinutes);
  const parts = [
    "HeadsDown session timebox is closing. Ask the user with AskUserQuestion and exactly these choices: Request 15 minutes, Request 30 minutes, Wrap up.",
    `If the user chooses Request 15 minutes, call headsdown_session_timebox with action=request_extension, session_id=${sessionId}, requested_extension_minutes=15.`,
    `If the user chooses Request 30 minutes, call headsdown_session_timebox with action=request_extension, session_id=${sessionId}, requested_extension_minutes=30.`,
    "If the user chooses Wrap up or ignores the prompt, do not request an extension; wrap up cleanly when appropriate.",
    "Do not include prompts, transcript text, file paths, repo names, logs, code, or free-form reasons in the extension request."
  ];
  appendLabeled(parts, "Remaining minutes", remainingMinutes);
  appendLabeled(parts, "Warning threshold minutes", thresholdMinutes);
  return parts.join(" ");
}
function appendLabeled(parts, label, value) {
  if (value) parts.push(`${label}: ${value}.`);
}
function appendWarning(contexts, record, field, format) {
  const value = stringField2(record?.[field]);
  if (value) contexts.push(format(value));
}
function integerField(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}
function stringValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return stringField2(value);
}
var init_post_tool_use = __esm({
  "src/hooks/post-tool-use.ts"() {
    "use strict";
    init_runtime();
    init_session_timebox();
  }
});

// src/hooks/index.ts
import { spawn as spawn2 } from "node:child_process";
async function hookCli(eventName = process.argv[3]) {
  const input = await readStdin5();
  const runner = createCliRunner();
  const payload = await runHook(eventName, input, runner);
  outputJson(payload);
}
async function runHook(eventName, input, runner) {
  switch (eventName) {
    case "session-start":
      return await sessionStartHandler(runner);
    case "user-prompt-submit":
      return await passthroughJson(runner, ["autopilot", "prompt"]);
    case "pre-tool-use-edit":
      return await preToolUseEditHandler(input, runner);
    case "pre-tool-use-ask":
      return await passthroughJson(runner, ["autopilot", "intercept-ask"]);
    case "post-tool-use":
      return await postToolUseHandler(input, runner);
    case "pre-compact":
      return await preCompactHandler(runner);
    case "stop-detect-deferral":
      return await stopDetectDeferralHandler(runner);
    case "stop-report":
      await runner(["report"]);
      return void 0;
    case "session-end":
      sessionEndHandler(input);
      return void 0;
    case "session-end-report":
      await sessionEndReportHandler();
      return void 0;
    default:
      process.exitCode = 1;
      return void 0;
  }
}
async function sessionStartHandler(runner) {
  const queuedMarker = asRecord3(await runCliJson(runner, ["action-marker", "active"], null));
  const queuedRunId = stringField2(queuedMarker?.runId);
  if (queuedRunId) {
    const handoffState = stringField2(queuedMarker?.handoffState) || "unknown";
    const attemptByAction = asRecord3(queuedMarker?.attemptByAction);
    const queuedAction = attemptByAction?.queue_for_morning ? "queue_for_morning" : stringField2(queuedMarker?.handoffKind) || "unknown";
    const systemMessage = queuedAction === "queue_for_morning" ? `[HeadsDown] Off the clock. Save the handoff and ask tomorrow. Run ${queuedRunId} is queued (handoff: ${handoffState}). Do not continue or ask again until resume_run succeeds or the user explicitly allows continuation. Claude Code controls the model. HeadsDown controls the run.` : `[HeadsDown] Queued run ${queuedRunId} is waiting. Handoff state: ${handoffState}. Do not continue or ask again until HeadsDown returns resume_run or the user explicitly resumes the run.`;
    return { systemMessage };
  }
  const statusResult = await runner(["status"]);
  if (statusResult.code !== 0 || !statusResult.stdout) return void 0;
  const status2 = asRecord3(parseJsonObject(statusResult.stdout));
  if (!status2) return void 0;
  const contract = asRecord3(status2.contract);
  const availability = asRecord3(status2.availability);
  const renderedCall = asRecord3(status2.renderedHeadsDownCall);
  let context = stringField2(renderedCall?.text) ? `[HeadsDown] ${stringField2(renderedCall?.text).replace(/\s+/g, " ")} Supporting availability context:` : "[HeadsDown] Supporting availability context:";
  const mode = stringField2(contract?.mode) || "unknown";
  const statusText = stringField2(contract?.statusText);
  if (mode === "unknown") {
    context += " Axis 1 (availability mode): not set.";
  } else {
    context += ` Axis 1 (availability mode, user-set): ${mode}.`;
    if (statusText) context += ` Status: ${statusText}.`;
  }
  if (availability) {
    context += availability.inReachableHours === true ? " Currently in available hours." : " Currently outside available hours.";
    const activeWindow = asRecord3(availability.activeWindow);
    const activeWindowLabel = stringField2(activeWindow?.label);
    if (activeWindowLabel) context += ` Active window: ${activeWindowLabel}.`;
    const wrapUpGuidance = asRecord3(availability.wrapUpGuidance);
    if (typeof wrapUpGuidance?.remainingMinutes === "number") {
      context += ` Remaining attention budget: ${wrapUpGuidance.remainingMinutes} minutes.`;
    }
  }
  const executionDirective = asRecord3(status2.executionDirective);
  const executionDirectiveCode = stringField2(executionDirective?.code);
  const executionDirectiveSummary = stringField2(executionDirective?.summary);
  if (executionDirectiveCode) {
    context += ` Axis 2 (execution directive, schedule-derived): ${executionDirectiveCode}.`;
    if (executionDirectiveSummary) context += ` ${executionDirectiveSummary}`;
  }
  const wrapUpInstruction = stringField2(status2.wrapUpInstruction);
  if (wrapUpInstruction) context += ` Execution guidance: ${wrapUpInstruction}`;
  const transition = asRecord3(await runCliJson(runner, ["next-window"], null));
  if (transition && typeof transition.minutesUntil === "number") {
    const nextLabel = stringField2(transition.nextWindowLabel);
    const nextMode = stringField2(transition.nextWindowMode);
    context += nextLabel ? ` Transition in ${transition.minutesUntil} minutes: next window is '${nextLabel}' (${nextMode}).` : ` Availability window transition in ${transition.minutesUntil} minutes.`;
    if (typeof transition.wrapUpThresholdMinutes === "number") {
      context += ` Wrap-up threshold is ${transition.wrapUpThresholdMinutes} minutes before transition.`;
    }
  }
  const digestResult = await runner(["digest-count"]);
  const digestCount2 = Number.parseInt(digestResult.stdout || "0", 10) || 0;
  if (digestCount2 === 1)
    context += " You have 1 digest summary from your last focus session. Use headsdown_digest to review what you missed.";
  if (digestCount2 > 1)
    context += ` You have ${digestCount2} digest summaries from your last focus session. Use headsdown_digest to review what you missed.`;
  const continuationResult = await runner(["continuation", "check"]);
  if (continuationResult.code === 0) {
    context += " [Continuation] A previous session left resumable work. Call headsdown_continuation with action 'load' for full details.";
  }
  const wakeUp = asRecord3(await runCliJson(runner, ["autopilot", "wake-up"], null));
  const wakeUpContext = stringField2(asRecord3(wakeUp?.hookSpecificOutput)?.additionalContext);
  const autopilotPrompt = asRecord3(
    await runCliJson(runner, ["autopilot", "prompt", "--as-session-context"], null)
  );
  const autopilotPromptContext = stringField2(
    asRecord3(autopilotPrompt?.hookSpecificOutput)?.additionalContext
  );
  const additionalContext = [wakeUpContext, autopilotPromptContext].filter(Boolean).join("\n\n");
  if (additionalContext) {
    return {
      systemMessage: context,
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext }
    };
  }
  return { systemMessage: context };
}
async function preToolUseEditHandler(input, runner) {
  const queuedMarker = asRecord3(await runCliJson(runner, ["action-marker", "active"], null));
  const queuedRunId = stringField2(queuedMarker?.runId);
  if (queuedRunId) {
    const handoffState = stringField2(queuedMarker?.handoffState) || "unknown";
    return {
      hookSpecificOutput: { permissionDecision: "deny" },
      systemMessage: `[HeadsDown] Run ${queuedRunId} is queued. Handoff state: ${handoffState}. Do not continue, modify files, or ask again until HeadsDown returns resume_run or the user explicitly resumes the run.`
    };
  }
  const hookInput = parseJsonObject(input);
  const toolInput = asRecord3(hookInput.tool_input) ?? asRecord3(hookInput.toolInput);
  const filePath = stringField2(toolInput?.file_path) || stringField2(toolInput?.path) || stringField2(toolInput?.filePath);
  const config2 = asRecord3(
    await runCliJson(runner, ["config"], { trustLevel: "advisory", sensitivePaths: [] })
  );
  const sensitivePaths = Array.isArray(config2?.sensitivePaths) ? config2.sensitivePaths.filter((item) => typeof item === "string") : [];
  const sensitiveMatch = filePath ? sensitivePaths.find((pattern) => globishMatch(filePath, pattern)) : void 0;
  if (sensitiveMatch) {
    return {
      hookSpecificOutput: { permissionDecision: "ask" },
      systemMessage: `[HeadsDown] Sensitive file detected: ${filePath} matches protected pattern '${sensitiveMatch}'. User confirmation required regardless of availability mode.`
    };
  }
  const status2 = asRecord3(await runCliJson(runner, ["status"], null));
  if (!status2) return void 0;
  const contract = asRecord3(status2.contract);
  const mode = stringField2(contract?.mode) || "none";
  const statusText = stringField2(contract?.statusText);
  const statusLabel = statusText ? ` (${statusText})` : "";
  const lock = contract?.lock === true;
  const trustLevel = stringField2(config2?.trustLevel) || "advisory";
  const proposalCheck = trustLevel === "active" || trustLevel === "guarded" ? await runner(["proposals", "--check"]) : null;
  const hasProposal = proposalCheck?.code === 0;
  const proposal = hasProposal ? asRecord3(await runCliJson(runner, ["proposals"], null)) : null;
  const proposalDesc = stringField2(proposal?.description);
  if (trustLevel === "advisory") {
    if (mode === "offline") {
      return {
        hookSpecificOutput: { permissionDecision: "ask" },
        systemMessage: `[HeadsDown] User is OFFLINE. Ask for explicit permission before making changes.`
      };
    }
    if (mode === "busy" && lock) {
      return {
        hookSpecificOutput: { permissionDecision: "ask" },
        systemMessage: `[HeadsDown] User is in BUSY mode${statusLabel} with status locked. Ask before making changes.`
      };
    }
    if (mode === "busy")
      return {
        systemMessage: `[HeadsDown] User is in BUSY mode${statusLabel}. Consider submitting a task proposal via headsdown_propose before proceeding.`
      };
    if (mode === "limited")
      return {
        systemMessage: `[HeadsDown] User has LIMITED availability${statusLabel}. Keep changes small and focused.`
      };
  }
  if (trustLevel === "active") {
    if (mode === "online" || mode === "none") {
      if (!hasProposal) return void 0;
      return {
        hookSpecificOutput: { permissionDecision: "allow" },
        systemMessage: `[HeadsDown] Auto-approved: online mode with approved proposal (${proposalDesc}).`
      };
    }
    if (mode === "busy" && lock) {
      return {
        hookSpecificOutput: { permissionDecision: "ask" },
        systemMessage: `[HeadsDown] User is in BUSY mode${statusLabel} with status locked. Ask before proceeding.`
      };
    }
    if (mode === "busy") {
      return hasProposal ? {
        hookSpecificOutput: { permissionDecision: "allow" },
        systemMessage: `[HeadsDown] Auto-approved: proposal approved (${proposalDesc}). User is busy${statusLabel}.`
      } : {
        systemMessage: `[HeadsDown] User is BUSY${statusLabel}. Submit a task proposal via headsdown_propose before making changes.`
      };
    }
    if (mode === "limited") {
      return hasProposal ? {
        hookSpecificOutput: { permissionDecision: "allow" },
        systemMessage: `[HeadsDown] Auto-approved: proposal approved (${proposalDesc}). Keep changes focused.`
      } : {
        systemMessage: `[HeadsDown] User has LIMITED availability${statusLabel}. Submit a proposal or keep changes small.`
      };
    }
    if (mode === "offline") {
      return {
        hookSpecificOutput: { permissionDecision: "ask" },
        systemMessage: "[HeadsDown] User is OFFLINE. Ask for explicit permission even with an approved proposal."
      };
    }
  }
  if (trustLevel === "guarded") {
    if (mode === "online" || mode === "none") return void 0;
    if (mode === "busy" && lock) {
      return {
        hookSpecificOutput: { permissionDecision: "ask" },
        systemMessage: `[HeadsDown] User is BUSY${statusLabel} with status locked. Explicit permission required.`
      };
    }
    if (mode === "busy") {
      return hasProposal ? {
        hookSpecificOutput: { permissionDecision: "allow" },
        systemMessage: `[HeadsDown] Approved: proposal verified (${proposalDesc}). Proceeding in busy mode.`
      } : {
        hookSpecificOutput: { permissionDecision: "ask" },
        systemMessage: `[HeadsDown] User is BUSY${statusLabel}. No approved proposal found. Submit one via headsdown_propose or ask the user for permission.`
      };
    }
    if (mode === "limited") {
      return hasProposal ? {
        hookSpecificOutput: { permissionDecision: "allow" },
        systemMessage: `[HeadsDown] Approved: proposal verified (${proposalDesc}). Keep changes focused.`
      } : {
        hookSpecificOutput: { permissionDecision: "ask" },
        systemMessage: `[HeadsDown] User has LIMITED availability${statusLabel}. No approved proposal. Ask before proceeding.`
      };
    }
    if (mode === "offline") {
      return {
        hookSpecificOutput: { permissionDecision: "ask" },
        systemMessage: "[HeadsDown] User is OFFLINE. All changes require explicit permission."
      };
    }
  }
  return void 0;
}
async function preCompactHandler(runner) {
  const proposal = asRecord3(await runCliJson(runner, ["proposals"], null));
  const status2 = asRecord3(await runCliJson(runner, ["status"], null));
  const proposalDesc = stringField2(proposal?.description);
  const estimatedFiles = proposal?.estimatedFiles === void 0 ? "" : String(proposal.estimatedFiles);
  const wrapUpInstruction = stringField2(status2?.wrapUpInstruction);
  if (!proposalDesc && !wrapUpInstruction) return void 0;
  let context = "[HeadsDown] Before compaction:";
  if (proposalDesc) {
    context += ` You have an approved proposal: '${proposalDesc}'.`;
    if (estimatedFiles && estimatedFiles !== "0") context += ` (estimated ${estimatedFiles} files)`;
    context += " Include this in your compaction summary so you can resume the task after context is rebuilt.";
  }
  if (wrapUpInstruction) context += ` Execution policy: ${wrapUpInstruction}`;
  return { systemMessage: context };
}
async function passthroughJson(runner, args) {
  const result2 = await runner(args);
  if (result2.code !== 0 || !result2.stdout) return void 0;
  return parseJsonObject(result2.stdout);
}
async function stopDetectDeferralHandler(runner) {
  const result2 = await runner(["autopilot", "detect-deferral"]);
  if (result2.code === 2) {
    if (result2.stderr) process.stderr.write(result2.stderr);
    process.exitCode = 2;
  }
  if (result2.stdout) return parseJsonObject(result2.stdout);
  return void 0;
}
function sessionEndHandler(input) {
  try {
    const hookInput = parseJsonObject(input);
    const sessionId = safeSessionId(
      stringField2(hookInput.session_id) || stringField2(hookInput.sessionId) || process.env.CLAUDE_SESSION_ID || "default"
    );
    const rawReason = stringField2(hookInput.reason) || "other";
    const reason = SESSION_END_REASONS.has(rawReason) ? rawReason : "other";
    const endedAt = (/* @__PURE__ */ new Date()).toISOString();
    const cliPath = process.argv[1];
    if (!cliPath) return;
    const child = spawn2(process.execPath, [cliPath, "hook", "session-end-report"], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        HEADSDOWN_SESSION_END_SESSION_ID: sessionId,
        HEADSDOWN_SESSION_END_REASON: reason,
        HEADSDOWN_SESSION_END_ENDED_AT: endedAt
      }
    });
    child.unref();
  } catch {
  }
}
async function sessionEndReportHandler() {
  const activeRun = await getActiveRunStateForSession().catch(() => null);
  try {
    const sessionId = safeSessionId(process.env.HEADSDOWN_SESSION_END_SESSION_ID || "default");
    const rawReason = process.env.HEADSDOWN_SESSION_END_REASON || "other";
    const reason = SESSION_END_REASONS.has(rawReason) ? rawReason : "other";
    const endedAt = process.env.HEADSDOWN_SESSION_END_ENDED_AT || (/* @__PURE__ */ new Date()).toISOString();
    const client = (await HeadsDownClient.fromCredentials()).withActor({
      source: "claude-code",
      agentId: "claude-code:session-end",
      sessionId,
      workspaceRef: "unknown"
    });
    const runId = activeRun?.runId ?? fallbackRunId(sessionId);
    await reportAgentRunEventCompat(client, {
      runId,
      eventType: "integration.session_ended",
      sequence: (activeRun?.sequence ?? 0) + 1,
      idempotencyKey: `${runId}:integration.session_ended:${sessionId}`,
      correlationId: activeRun?.proposalId ?? runId,
      proposalRef: activeRun?.proposalId ?? void 0,
      payload: {
        session_id: sessionId,
        outcome: reason === "logout" || reason === "clear" || reason === "resume" ? "succeeded" : "cancelled",
        reason,
        ended_at: endedAt
      }
    });
  } catch {
  } finally {
    if (activeRun) await clearRunState(activeRun.runId).catch(() => void 0);
  }
}
function safeSessionId(value) {
  return SAFE_SESSION_ID_PATTERN.test(value) ? value : "default";
}
function fallbackRunId(sessionId) {
  return `run_${sessionId}`.slice(0, 256);
}
function globishMatch(value, pattern) {
  const doubleStar = "__HEADSDOWN_DOUBLE_STAR__";
  const escaped = pattern.replace(/\*\*/g, doubleStar).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replaceAll(doubleStar, ".*");
  return new RegExp(`(^|/)${escaped}$`).test(value);
}
var SESSION_END_REASONS, SAFE_SESSION_ID_PATTERN;
var init_hooks = __esm({
  "src/hooks/index.ts"() {
    "use strict";
    init_dist();
    init_agent_run_reporter();
    init_agent_run_state();
    init_post_tool_use();
    init_runtime();
    SESSION_END_REASONS = /* @__PURE__ */ new Set([
      "clear",
      "resume",
      "logout",
      "prompt_input_exit",
      "bypass_permissions_disabled",
      "other"
    ]);
    SAFE_SESSION_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,256}$/;
  }
});

// src/time-box-store.ts
import { mkdir as mkdir8, readFile as readFile11, unlink as unlink3, writeFile as writeFile10 } from "node:fs/promises";
import { createHash as createHash3 } from "node:crypto";
import { dirname as dirname6, join as join12 } from "node:path";
import { homedir as homedir9 } from "node:os";
function defaultSessionIdHash(env = process.env) {
  const sessionId = clean2(env.CLAUDE_SESSION_ID) ?? "default";
  return hashSessionId(sessionId);
}
function defaultTimeBoxPath(env = process.env) {
  const override = clean2(env.HEADSDOWN_TIME_BOX_PATH);
  if (override) return override;
  return join12(homedir9(), ".config", "headsdown", `time-box-${defaultSessionIdHash(env)}.json`);
}
function hashSessionId(sessionId) {
  return createHash3("sha256").update(sessionId).digest("hex").slice(0, 16);
}
function validateStoredTimeBoxState(value) {
  if (!value || typeof value !== "object") return "state must be an object";
  const candidate = value;
  if (candidate.schemaVersion !== 1) return "schemaVersion must be 1";
  if (typeof candidate.sessionIdHash !== "string" || candidate.sessionIdHash.trim().length === 0) {
    return "sessionIdHash must be a non-empty string";
  }
  if (typeof candidate.durationMinutes !== "number" || !Number.isFinite(candidate.durationMinutes) || !Number.isInteger(candidate.durationMinutes) || candidate.durationMinutes <= 0) {
    return "durationMinutes must be a positive integer";
  }
  if (typeof candidate.createdAt !== "string") return "createdAt must be a timestamp string";
  if (typeof candidate.expiresAt !== "string") return "expiresAt must be a timestamp string";
  const createdAtMs = Date.parse(candidate.createdAt);
  const expiresAtMs = Date.parse(candidate.expiresAt);
  if (Number.isNaN(createdAtMs)) return "createdAt must be a valid timestamp";
  if (Number.isNaN(expiresAtMs)) return "expiresAt must be a valid timestamp";
  if (expiresAtMs < createdAtMs) return "expiresAt must not be before createdAt";
  if (Math.round((expiresAtMs - createdAtMs) / 6e4) !== candidate.durationMinutes) {
    return "expiresAt must match durationMinutes";
  }
  if (candidate.source !== "slash_command") return 'source must be "slash_command"';
  return null;
}
function isNodeError(error) {
  return error instanceof Error && "code" in error;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function clean2(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
var LocalTimeBoxStore;
var init_time_box_store = __esm({
  "src/time-box-store.ts"() {
    "use strict";
    LocalTimeBoxStore = class {
      constructor(filePath = defaultTimeBoxPath(), sessionIdHash = defaultSessionIdHash()) {
        this.filePath = filePath;
        this.sessionIdHash = sessionIdHash;
      }
      get sessionHash() {
        return this.sessionIdHash;
      }
      async save(state) {
        const validationError = validateStoredTimeBoxState(state);
        if (validationError) {
          throw new Error(`Cannot save invalid HeadsDown box: ${validationError}`);
        }
        if (state.sessionIdHash !== this.sessionIdHash) {
          throw new Error("Cannot save HeadsDown box for a different Claude session.");
        }
        await mkdir8(dirname6(this.filePath), { recursive: true });
        await writeFile10(this.filePath, JSON.stringify(state, null, 2), { mode: 384 });
      }
      async load() {
        let raw;
        try {
          raw = await readFile11(this.filePath, "utf-8");
        } catch (error) {
          if (isNodeError(error) && error.code === "ENOENT") return null;
          throw new Error(`Could not read HeadsDown box at ${this.filePath}: ${errorMessage(error)}`);
        }
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (error) {
          throw new Error(`Invalid HeadsDown box at ${this.filePath}: ${errorMessage(error)}`);
        }
        const validationError = validateStoredTimeBoxState(parsed);
        if (validationError) {
          throw new Error(`Invalid HeadsDown box at ${this.filePath}: ${validationError}`);
        }
        const state = parsed;
        if (state.sessionIdHash !== this.sessionIdHash) return null;
        return state;
      }
      async clear() {
        try {
          await unlink3(this.filePath);
          return true;
        } catch (error) {
          if (isNodeError(error) && error.code === "ENOENT") return true;
          throw new Error(`Could not clear HeadsDown box at ${this.filePath}: ${errorMessage(error)}`);
        }
      }
    };
  }
});

// src/referee/local-runner.ts
import { execFile as execFileCallback } from "node:child_process";
import { readFile as readFile12, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
function assertInsideWorkspace(workspaceRoot, candidatePath) {
  const relativePath = relative(workspaceRoot, candidatePath);
  if (relativePath === ".." || relativePath.startsWith("../") || relativePath.startsWith("..\\") || isAbsolute(relativePath)) {
    throw new Error("Local Referee contract_path must stay inside the workspace.");
  }
}
async function resolveContractPath(options) {
  const workspaceRoot = await options.realpath(options.cwd);
  const requestedPath = options.contractPath?.trim() || LOCAL_REFEREE_CONTRACT_PATH;
  const lexicalPath = isAbsolute(requestedPath) ? resolve(requestedPath) : resolve(workspaceRoot, requestedPath);
  assertInsideWorkspace(workspaceRoot, lexicalPath);
  let realContractPath;
  try {
    realContractPath = await options.realpath(lexicalPath);
  } catch {
    throw new Error(
      `Local Referee contract not found. Create ${LOCAL_REFEREE_CONTRACT_PATH} or pass contract_path.`
    );
  }
  assertInsideWorkspace(workspaceRoot, realContractPath);
  return realContractPath;
}
async function defaultGitStatusShort(cwd) {
  const result2 = await execFile("git", [...GIT_STATUS_ARGS], {
    cwd,
    timeout: 5e3,
    maxBuffer: 1024 * 1024
  });
  return result2.stdout;
}
function countTouchedFilesFromGitStatus(status2) {
  return status2.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}
async function countTouchedFiles(cwd, gitStatusShort) {
  try {
    return countTouchedFilesFromGitStatus(await gitStatusShort(cwd));
  } catch {
    throw new Error(
      "Local Referee could not count touched files with git status. Pass files_touched evidence explicitly."
    );
  }
}
async function loadLocalRefereeContract(options) {
  const resolveRealpath = options.adapters?.realpath ?? realpath;
  const path = await resolveContractPath({
    cwd: options.cwd,
    contractPath: options.contractPath,
    realpath: resolveRealpath
  });
  const read = options.adapters?.readFile ?? readFile12;
  const contents = await read(path, "utf-8");
  return parseLocalRefereeContractJson(contents);
}
async function collectLocalRefereeEvidence(options) {
  const rawEvidence = options.evidence ?? {};
  const gitStatusShort = options.adapters?.gitStatusShort ?? defaultGitStatusShort;
  const filesTouched = rawEvidence.filesTouched === void 0 || rawEvidence.filesTouched === null ? await countTouchedFiles(options.cwd, gitStatusShort) : rawEvidence.filesTouched;
  return normalizeLocalRefereeEvidence({
    ...rawEvidence,
    filesTouched,
    networkRequired: rawEvidence.networkRequired ?? false
  });
}
async function runLocalReferee(options) {
  const contract = await loadLocalRefereeContract(options);
  const evidence = await collectLocalRefereeEvidence(options);
  const evaluation = evaluateLocalRefereeContract(contract, evidence);
  const receipt = buildLocalRefereeReceipt({ contract, evidence, evaluation, now: options.now });
  return {
    contract,
    evidence,
    evaluation,
    receipt,
    renderedReceipt: renderLocalRefereeReceiptMarkdown(receipt)
  };
}
var execFile, GIT_STATUS_ARGS;
var init_local_runner = __esm({
  "src/referee/local-runner.ts"() {
    "use strict";
    init_referee();
    execFile = promisify(execFileCallback);
    GIT_STATUS_ARGS = ["status", "--short", "--untracked-files=all"];
  }
});

// src/referee/index.ts
var init_referee2 = __esm({
  "src/referee/index.ts"() {
    "use strict";
    init_local_runner();
  }
});

// src/cli.ts
var cli_exports = {};
import { readFile as readFile13, writeFile as writeFile11, unlink as unlink4, access as access6 } from "node:fs/promises";
import { join as join13, dirname as dirname7 } from "node:path";
import { homedir as homedir10 } from "node:os";
import { mkdirSync } from "node:fs";
async function main() {
  switch (command) {
    case "status":
      return await status();
    case "summary":
      return await summary();
    case "config":
      return await config();
    case "proposals":
      return await proposals();
    case "digest-count":
      return await digestCount();
    case "next-window":
      return await nextWindow();
    case "continuation":
      return await continuation();
    case "report":
      return await report();
    case "report-progress":
      return await reportProgress();
    case "action-marker":
      return await actionMarker();
    case "time-box":
      return await timeBox();
    case "referee":
      return await referee();
    case "autopilot":
      return await autopilotCli();
    case "hook":
      return await hookCli();
    default:
      process.exit(1);
  }
}
async function status() {
  const timeBoxLoad = await loadLocalTimeBoxForStatus();
  const timeBoxStatus = buildTimeBoxStatus(timeBoxLoad.state);
  const activeRun = await getActiveRunStateForSession().catch(() => null);
  let contract = null;
  let availability = null;
  let overview = null;
  let availabilityError = null;
  try {
    const client = await HeadsDownClient.fromCredentials();
    const actorClient = withActorContext2(client, "cli-status");
    try {
      const response = await actorClient.getAvailability();
      contract = response.contract;
      availability = response.schedule;
    } catch (error) {
      availabilityError = `Could not query HeadsDown availability: ${safeErrorMessage2(error)}`;
    }
    overview = await getAgentControlOverviewCompat(actorClient);
  } catch (error) {
    availabilityError = error instanceof AuthError ? `HeadsDown authentication is unavailable. Run /headsdown:auth before relying on status.` : `HeadsDown status is unavailable: ${safeErrorMessage2(error)}`;
  }
  const renderedHeadsDownCall = overview?.headsdownCall ? renderHeadsDownCall(overview.headsdownCall) : null;
  const currentRun = resolveCurrentRunContext({ activeRun, overview });
  const effectiveAttentionWindow = resolveEffectiveAttentionWindow({
    backend: availability?.wrapUpGuidance ?? null,
    timeBox: timeBoxLoad.state,
    forceTimeBoxWarning: currentRun.callKey === "attention_window_closing"
  });
  const attentionWindowClosing = !!effectiveAttentionWindow && (currentRun.callKey === "attention_window_closing" || isWithinWarningWindow(effectiveAttentionWindow));
  const sessionTimeboxPrompt = resolveSessionTimeboxPrompt({
    sessionSummaries: overview?.sessionSummaries ?? null,
    currentSessionId: process.env.CLAUDE_SESSION_ID,
    thresholdMinutes: effectiveAttentionWindow?.thresholdMinutes ?? availability?.wrapUpGuidance?.thresholdMinutes ?? null
  });
  console.log(
    JSON.stringify(
      {
        contract,
        availability,
        availabilityError,
        headsdownCall: overview?.headsdownCall ?? null,
        renderedHeadsDownCall,
        currentRun,
        timeBox: timeBoxStatus,
        timeBoxError: timeBoxLoad.error,
        attentionWindowClosing,
        effectiveAttentionWindow,
        sessionTimeboxPrompt,
        summary: contract && availability ? formatSummary(contract, availability, renderedHeadsDownCall?.title) : null,
        wrapUpInstruction: contract && availability ? resolveExecutionInstruction2({
          contract,
          schedule: availability
        }) : null,
        remainingMinutes: effectiveAttentionWindow?.remainingMinutes ?? availability?.wrapUpGuidance?.remainingMinutes ?? null
      },
      null,
      2
    )
  );
}
async function summary() {
  const client = await HeadsDownClient.fromCredentials();
  const actorClient = withActorContext2(client, "cli-summary");
  const { contract, schedule: availability } = await actorClient.getAvailability();
  const overview = await getAgentControlOverviewCompat(actorClient);
  const renderedHeadsDownCall = overview?.headsdownCall ? renderHeadsDownCall(overview.headsdownCall) : null;
  console.log(formatSummary(contract, availability, renderedHeadsDownCall?.title));
}
async function config() {
  const store = new ConfigStore();
  const cfg = await store.load();
  console.log(JSON.stringify(cfg, null, 2));
}
async function proposals() {
  const store = new ProposalStateStore();
  const flag = process.argv[3];
  if (flag === "--check") {
    const hasApproved = await store.hasApprovedProposal();
    process.exit(hasApproved ? 0 : 1);
  }
  const latest = await store.getLatestApproved();
  if (latest) {
    const metaPath = store.filePath.replace(/\.json$/, ".meta.json");
    let meta = {};
    try {
      const metaRaw = await readFile13(metaPath, "utf-8");
      meta = JSON.parse(metaRaw);
    } catch {
    }
    console.log(JSON.stringify({ ...latest, ...meta }, null, 2));
  } else {
    console.log(JSON.stringify(null));
  }
}
async function nextWindow() {
  const client = await HeadsDownClient.fromCredentials();
  const actorClient = withActorContext2(client, "cli-next-window");
  const { schedule: availability } = await actorClient.getAvailability();
  const { nextTransitionAt, nextWindow: next, wrapUpGuidance } = availability;
  if (!nextTransitionAt) {
    console.log(JSON.stringify(null));
    return;
  }
  const transitionAt = new Date(nextTransitionAt);
  const now = /* @__PURE__ */ new Date();
  const minutesUntil3 = Math.round((transitionAt.getTime() - now.getTime()) / 6e4);
  if (minutesUntil3 < 0 || minutesUntil3 > 60) {
    console.log(JSON.stringify(null));
    return;
  }
  console.log(
    JSON.stringify({
      nextWindowLabel: next?.label ?? null,
      nextWindowMode: next?.mode ?? null,
      minutesUntil: minutesUntil3,
      wrapUpThresholdMinutes: wrapUpGuidance.thresholdMinutes ?? null
    })
  );
}
async function digestCount() {
  const client = await HeadsDownClient.fromCredentials();
  const actorClient = withActorContext2(client, "cli-digest-count");
  const summaries = await actorClient.listDigestSummaries({ latest: 50 });
  console.log(String(summaries.length));
}
async function actionMarker() {
  const subcommand = process.argv[3];
  const store = new LocalActionMarkerStore();
  switch (subcommand) {
    case "active": {
      const markers = await store.listActive();
      console.log(JSON.stringify(markers[0] ?? null, null, 2));
      break;
    }
    default:
      process.exit(1);
  }
}
async function timeBox() {
  const subcommand = process.argv[3];
  const store = new LocalTimeBoxStore();
  switch (subcommand) {
    case "set": {
      const durationText = process.argv[4];
      if (!durationText) {
        console.error("Use a duration like 30m, 45m, 1h, or 1h30m.");
        process.exit(1);
      }
      try {
        const state = createTimeBox({ durationText, sessionIdHash: store.sessionHash });
        await store.save(state);
        console.log(
          JSON.stringify(
            {
              ok: true,
              action: "set",
              timeBox: buildTimeBoxStatus(state),
              message: formatTimeBoxConfirmation(state)
            },
            null,
            2
          )
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      break;
    }
    case "status": {
      try {
        const state = await store.load();
        console.log(JSON.stringify(buildTimeBoxStatus(state), null, 2));
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      break;
    }
    case "clear": {
      try {
        await store.clear();
        console.log(
          JSON.stringify(
            {
              ok: true,
              action: "clear",
              timeBox: buildTimeBoxStatus(null),
              message: "HeadsDown box cleared. Backend-derived attention-window behavior is active again."
            },
            null,
            2
          )
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      break;
    }
    case "active": {
      try {
        const state = await store.load();
        if (!state) {
          console.log(JSON.stringify(null));
          process.exit(1);
        }
        console.log(JSON.stringify(buildTimeBoxStatus(state), null, 2));
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      break;
    }
    default:
      process.exit(1);
  }
}
async function referee() {
  try {
    const { contractPath, evidence } = await parseRefereeArgs(process.argv.slice(3));
    const result2 = await runLocalReferee({ cwd: process.cwd(), contractPath, evidence });
    console.log(result2.renderedReceipt);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
async function parseRefereeArgs(args) {
  const evidence = {};
  let contractPath;
  let hasEvidence = false;
  let deleteEvidenceFile = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    switch (arg) {
      case "--contract-path":
        contractPath = requireValue(arg, next);
        index += 1;
        break;
      case "--evidence-json": {
        const parsed = parseEvidenceJson(requireValue(arg, next));
        Object.assign(evidence, parsed);
        hasEvidence = true;
        index += 1;
        break;
      }
      case "--evidence-stdin": {
        const parsed = parseEvidenceJson(await readStdinText(), arg);
        Object.assign(evidence, parsed);
        hasEvidence = true;
        break;
      }
      case "--evidence-file": {
        const evidencePath = requireValue(arg, next);
        const parsed = parseEvidenceJson(
          await readEvidenceFile(evidencePath, deleteEvidenceFile),
          arg
        );
        Object.assign(evidence, parsed);
        hasEvidence = true;
        index += 1;
        break;
      }
      case "--delete-evidence-file":
        deleteEvidenceFile = true;
        break;
      case "--files-touched":
        evidence.filesTouched = requireValue(arg, next);
        hasEvidence = true;
        index += 1;
        break;
      case "--tool-calls":
        evidence.toolCalls = requireValue(arg, next);
        hasEvidence = true;
        index += 1;
        break;
      case "--validation-status":
        evidence.validationStatus = requireValue(arg, next);
        hasEvidence = true;
        index += 1;
        break;
      case "--tests-run":
        evidence.testsRun = requireValue(arg, next);
        hasEvidence = true;
        index += 1;
        break;
      case "--network-required":
        evidence.networkRequired = requireValue(arg, next);
        hasEvidence = true;
        index += 1;
        break;
      case "--git-commit-present":
        evidence.gitCommitPresent = requireValue(arg, next);
        hasEvidence = true;
        index += 1;
        break;
      case "--elapsed-minutes":
        evidence.elapsedMinutes = requireValue(arg, next);
        hasEvidence = true;
        index += 1;
        break;
      case "--manual-review-round-trips-avoided":
        evidence.manualReviewRoundTripsAvoided = requireValue(arg, next);
        hasEvidence = true;
        index += 1;
        break;
      case "--outcome":
        evidence.outcome = requireValue(arg, next);
        hasEvidence = true;
        index += 1;
        break;
      case void 0:
        break;
      default:
        throw new Error(`Unsupported referee option: ${arg}`);
    }
  }
  return { contractPath, evidence: hasEvidence ? evidence : void 0 };
}
function requireValue(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}
async function readStdinText() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}
async function readEvidenceFile(path, deleteAfterRead) {
  const value = await readFile13(path, "utf-8");
  if (deleteAfterRead) await unlink4(path);
  return value.trim();
}
function parseEvidenceJson(value, source = "--evidence-json") {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${source} must be a JSON object.`);
  }
  return parsed;
}
async function continuation() {
  const subcommand = process.argv[3];
  switch (subcommand) {
    case "save": {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks).toString("utf-8").trim();
      if (!data) {
        process.exit(1);
      }
      JSON.parse(data);
      mkdirSync(dirname7(CONTINUATION_PATH), { recursive: true });
      await writeFile11(CONTINUATION_PATH, data, { mode: 384 });
      break;
    }
    case "load": {
      const raw = await readFile13(CONTINUATION_PATH, "utf-8");
      console.log(raw);
      await unlink4(CONTINUATION_PATH);
      break;
    }
    case "check": {
      try {
        await access6(CONTINUATION_PATH);
      } catch {
        process.exit(1);
      }
      break;
    }
    default:
      process.exit(1);
  }
}
function resolveExecutionInstruction2(input) {
  const describeExecutionDirective2 = describeExecutionDirective;
  if (typeof describeExecutionDirective2 === "function") {
    const directive = describeExecutionDirective2(input);
    return directive.primaryDirective ?? null;
  }
  const guidance = input.verdict?.wrapUpGuidance ?? input.schedule?.wrapUpGuidance;
  if (!guidance || !guidance.active) {
    return null;
  }
  let instruction = "";
  if (guidance.selectedMode === "wrap_up") {
    instruction = "Execution policy for this task: keep scope minimal, avoid starting new refactors, finish the current slice cleanly, and include clear handoff notes for deferred work.";
  } else if (guidance.selectedMode === "full_depth") {
    instruction = "Execution policy for this task: proceed with full implementation depth, include robust validation and tests, and do not shrink scope only because a deadline is near.";
  } else {
    instruction = "Execution policy for this task: follow the provided context to balance scope and depth, stay focused on the requested outcome, and avoid unnecessary expansion.";
  }
  const context = [];
  if (typeof guidance.remainingMinutes === "number") {
    context.push(
      `About ${guidance.remainingMinutes} minutes remain before the attention deadline.`
    );
  }
  if (guidance.reason) {
    context.push(`Reason: ${guidance.reason}`);
  }
  if (guidance.hints && guidance.hints.length > 0) {
    context.push(`Hints: ${guidance.hints.join("; ")}`);
  }
  return [instruction, ...context].join(" ");
}
function withActorContext2(client, commandName) {
  const actorContext = {
    source: "claude-code",
    agentId: `claude-code:${commandName}`,
    sessionId: process.env.CLAUDE_SESSION_ID,
    workspaceRef: "unknown"
  };
  return client.withActor(actorContext);
}
function formatSummary(contract, availability, callSummary) {
  const parts = [];
  if (callSummary) {
    parts.push(`HeadsDown call: ${callSummary}`);
  }
  if (!contract) {
    parts.push("No active availability contract.");
  } else {
    parts.push(`Mode: ${contract.mode}`);
    if (contract.statusText) {
      const emoji = contract.statusEmoji ? `${contract.statusEmoji} ` : "";
      parts.push(`Status: ${emoji}${contract.statusText}`);
    }
    if (contract.expiresAt) {
      const expires = new Date(contract.expiresAt);
      const now = /* @__PURE__ */ new Date();
      const minutesLeft = Math.round((expires.getTime() - now.getTime()) / 6e4);
      if (minutesLeft > 0) {
        parts.push(`${minutesLeft}min remaining`);
      }
    }
    if (contract.lock) parts.push("locked");
  }
  parts.push(availability.inReachableHours ? "available hours" : "outside available hours");
  if (availability.activeWindow) {
    parts.push(
      `active availability window: ${availability.activeWindow.label} (${availability.activeWindow.mode})`
    );
  }
  const wrapUpInstruction = resolveExecutionInstruction2({
    contract,
    schedule: availability
  });
  if (wrapUpInstruction) {
    parts.push(`wrap-up instruction: ${wrapUpInstruction}`);
  }
  if (availability.nextWindow) {
    parts.push(
      `next availability window: ${availability.nextWindow.label} (${availability.nextWindow.mode})`
    );
  }
  return parts.join(", ");
}
async function report() {
  const store = new ProposalStateStore();
  const proposal = await store.getLatestApproved();
  if (!proposal) {
    process.exit(0);
  }
  let outcome = "completed";
  try {
    await access6(CONTINUATION_PATH);
    outcome = "partially_completed";
  } catch {
  }
  try {
    const client = await HeadsDownClient.fromCredentials();
    const actorClient = withActorContext2(client, "cli-report");
    const input = { proposalId: proposal.id, outcome };
    await actorClient.reportOutcome(input);
    const activeRun = await getActiveRunStateForSession();
    if (activeRun) {
      await reportRunOutcome(actorClient, { proposalId: activeRun.proposalId, outcome });
    }
  } catch {
  }
}
async function loadLocalTimeBoxForStatus() {
  try {
    return { state: await new LocalTimeBoxStore().load(), error: null };
  } catch (error) {
    return { state: null, error: error instanceof Error ? error.message : String(error) };
  }
}
async function reportProgress() {
  const toolType = process.argv[3];
  const filesModifiedCount = parseNonNegativeInteger(process.argv[4]);
  const activeRun = await getActiveRunStateForSession().catch(() => null);
  const timeBoxLoad = await loadLocalTimeBoxForStatus();
  try {
    const client = await HeadsDownClient.fromCredentials();
    const actorClient = withActorContext2(client, "cli-report-progress");
    let progressReportError = null;
    try {
      await reportRunProgress(actorClient, { toolType, filesModifiedCount });
    } catch (error) {
      progressReportError = `Could not send HeadsDown progress telemetry: ${safeErrorMessage2(error)}`;
    }
    const overview = await getAgentControlOverviewCompat(actorClient);
    let wrapUpGuidance = null;
    let availabilityError = null;
    try {
      const { schedule: availability } = await actorClient.getAvailability();
      wrapUpGuidance = availability.wrapUpGuidance ?? null;
    } catch (error) {
      wrapUpGuidance = null;
      availabilityError = `Could not query HeadsDown availability for wrap-up guidance: ${safeErrorMessage2(error)}`;
    }
    console.log(
      JSON.stringify({
        ...buildReportProgressResponse({
          activeRun,
          overview,
          wrapUpGuidance,
          timeBox: timeBoxLoad.state,
          currentSessionId: process.env.CLAUDE_SESSION_ID
        }),
        ...timeBoxLoad.error ? { timeBoxError: timeBoxLoad.error } : {},
        ...availabilityError ? { availabilityError } : {},
        ...progressReportError ? { progressReportError } : {}
      })
    );
  } catch (error) {
    const authFailure = error instanceof AuthError;
    console.log(
      JSON.stringify({
        ...buildReportProgressUnavailableResponse({
          errorCategory: authFailure ? "auth" : "unexpected",
          message: authFailure ? "HeadsDown authentication is unavailable. Run /headsdown:auth before relying on progress reporting." : "HeadsDown progress reporting is unavailable. Check the included details or try again later.",
          details: safeErrorMessage2(error),
          activeRun,
          timeBox: timeBoxLoad.state,
          currentSessionId: process.env.CLAUDE_SESSION_ID
        }),
        ...timeBoxLoad.error ? { timeBoxError: timeBoxLoad.error } : {}
      })
    );
  }
}
function parseNonNegativeInteger(value) {
  if (!value || !/^\d+$/.test(value)) return void 0;
  return Number(value);
}
function safeErrorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}
var command, CONTINUATION_PATH;
var init_cli2 = __esm({
  "src/cli.ts"() {
    "use strict";
    init_dist();
    init_dist();
    init_agent_control2();
    init_agent_run_events2();
    init_agent_run_state();
    init_headsdown_action_executor();
    init_cli();
    init_hooks();
    init_time_box_store();
    init_time_box();
    init_session_timebox();
    init_referee2();
    init_report_progress_response();
    command = process.argv[2];
    CONTINUATION_PATH = join13(homedir10(), ".config", "headsdown", "continuation.json");
    main().catch((error) => {
      if (error instanceof AuthError) {
        process.exit(1);
      }
      process.exit(1);
    });
  }
});

// src/index.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/server.ts
init_dist();
init_dist();
init_agent_control2();
init_agent_run_events2();
init_agent_run_state();
import { writeFile as writeFile7, readFile as readFile7, unlink as unlink2, mkdir as mkdir6, access as access2 } from "node:fs/promises";
import { join as join7, dirname as dirname4 } from "node:path";
import { homedir as homedir5 } from "node:os";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// src/headsdown-deferred-tool.ts
init_dist();
init_wake_up_digest();
async function handleDeferredTool(client, args) {
  const action = normalizeAction(args.action);
  const events = await client.listAgentRunEvents({ limit: normalizeLimit(args.latest) });
  const entries = unresolvedDeferredEntries(events);
  if (action === "list") return safeOutput({ entries, summary: summarizeWakeUpDigest(entries) });
  const decisionId = typeof args.decision_id === "string" ? args.decision_id.trim() : "";
  if (!decisionId) throw new Error("The 'decision_id' parameter is required for this action.");
  const entry = entries.find((candidate) => candidate.decisionId === decisionId);
  if (!entry) {
    if (hasResolvedEvent(events, decisionId))
      throw new Error("Deferred decision is already resolved.");
    if (findRecordedEntry(events, decisionId)) {
      throw new Error("Deferred decision is already surfaced or unavailable for resolution.");
    }
    throw new Error("Deferred decision not found.");
  }
  if (action === "view") return safeOutput({ entry });
  const resolutionKind = resolutionKindForAction(action);
  const result2 = await client.reportDeferredDecisionResolved(
    {
      runId: entry.runId,
      source: "claude_code",
      workspaceRef: "unknown",
      proposalRef: entry.runId,
      correlationId: entry.runId
    },
    {
      decision_id: entry.decisionId,
      resolution_kind: resolutionKind,
      notes_bucket: notesBucketForAction(action)
    }
  ).catch(() => null);
  if (result2?.ok !== true) throw new Error("Could not resolve deferred decision.");
  return safeOutput({ resolved: true, decisionId: entry.decisionId, resolutionKind });
}
function hasResolvedEvent(events, decisionId) {
  return events.some((event) => {
    const record = event;
    const payload = record.payload && typeof record.payload === "object" ? record.payload : {};
    return record.eventType === "deferred_decision.resolved" && payload.decision_id === decisionId;
  });
}
function findRecordedEntry(events, decisionId) {
  for (const event of events) {
    const entry = deferredDecisionEntryFromEvent(event);
    if (entry?.decisionId === decisionId) return entry;
  }
  return null;
}
function normalizeAction(value) {
  if (value === void 0 || value === null || value === "") return "list";
  if (value === "view" || value === "approve" || value === "override" || value === "refine" || value === "dismiss" || value === "list") {
    return value;
  }
  throw new Error("Invalid action for headsdown_deferred.");
}
function normalizeLimit(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 100) : 50;
}
function resolutionKindForAction(action) {
  if (action === "approve") return "approved";
  if (action === "override") return "overridden";
  if (action === "refine") return "refined";
  return "dismissed";
}
function notesBucketForAction(action) {
  if (action === "override") return "wrong_framing";
  if (action === "refine") return "needs_more_info";
  if (action === "dismiss") return "other";
  return void 0;
}
function safeOutput(value) {
  assertPrivacySafe(value);
  return value;
}

// src/server.ts
init_headsdown_action_executor();
init_report_progress_response();
init_sdk_compat();
init_session_timebox();
var proposalState = new ProposalStateStore();
function createActionMarkerStore() {
  return new LocalActionMarkerStore();
}
var activeTracker = null;
function createServer() {
  const server = new Server(
    { name: "headsdown", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "headsdown_status",
        description: "Check the user's current availability on HeadsDown. Returns their focus mode (online/busy/limited/offline), status message, time remaining, and availability state. Call this before starting any significant task to understand whether the user is available, in focus mode, or away. If the user is in 'busy' or 'limited' mode, respect their focus time and scope work accordingly.",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "headsdown_propose",
        description: "Submit a task proposal to HeadsDown for a verdict before starting work. HeadsDown evaluates the proposal against the user's current availability and returns APPROVED (proceed normally) or DEFERRED (suggest postponing or reducing scope). Always call headsdown_status first, then submit a proposal for any non-trivial task. Include a clear description of what you plan to do.",
        inputSchema: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "What you plan to do. Be specific: 'Refactor auth module to use JWT tokens' not 'make changes'."
            },
            estimated_files: {
              type: "number",
              description: "Estimated number of files you'll modify."
            },
            estimated_minutes: {
              type: "number",
              description: "Estimated time in minutes to complete the task."
            },
            scope_summary: {
              type: "string",
              description: "Brief summary of the scope: which modules, what kind of changes."
            },
            source_ref: {
              type: "string",
              description: "Reference to the task source: ticket number, PR URL, or description."
            },
            delivery_mode: {
              type: "string",
              enum: ["auto", "wrap_up", "full_depth"],
              description: "Optional task delivery mode override for Wrap-Up guidance."
            }
          },
          required: ["description"]
        }
      },
      {
        name: "headsdown_grants",
        description: "Manage HeadsDown delegation grants for actor-scoped authorization. Supports listing active grants, listing/filtering, creating grants, and revoking grants.",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["list_active", "list", "create", "revoke", "revoke_many"],
              description: "Action to run. Defaults to list_active."
            },
            id: {
              type: "string",
              description: "Grant id for action='revoke'."
            },
            scope: {
              type: "string",
              enum: ["session", "workspace", "agent"],
              description: "Scope for create/list/revoke_many."
            },
            session_id: {
              type: "string",
              description: "Session id for session scope."
            },
            workspace_ref: {
              type: "string",
              description: "Workspace reference for workspace scope."
            },
            agent_id: {
              type: "string",
              description: "Agent id for agent scope."
            },
            permissions: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "availability_override_create",
                  "availability_override_cancel",
                  "preset_apply"
                ]
              },
              description: "Permissions for action='create'."
            },
            duration_minutes: {
              type: "number",
              description: "Relative expiry in minutes for action='create'."
            },
            expires_at: {
              type: "string",
              description: "Absolute ISO expiry for action='create'."
            },
            source: {
              type: "string",
              description: "Audit source label for create/list/revoke_many."
            },
            active: {
              type: "boolean",
              description: "Active filter for list/revoke_many."
            }
          },
          required: []
        }
      },
      {
        name: "headsdown_override",
        description: "Manage temporary HeadsDown availability overrides. Supports getting active override, setting one, and clearing an active override.",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["get", "set", "clear"],
              description: "Action to run. Defaults to get."
            },
            id: {
              type: "string",
              description: "Override id for clear (optional; active override is used if omitted)."
            },
            mode: {
              type: "string",
              enum: ["online", "busy", "limited", "offline"],
              description: "Override mode for action='set'."
            },
            duration_minutes: {
              type: "number",
              description: "Relative expiry in minutes for action='set'."
            },
            expires_at: {
              type: "string",
              description: "Absolute ISO expiry for action='set'."
            },
            reason: {
              type: "string",
              description: "Optional reason for set/clear."
            }
          },
          required: []
        }
      },
      {
        name: "headsdown_auth",
        description: "Authenticate with HeadsDown using Device Flow. Run this if other HeadsDown tools report authentication errors. Starts an authorization flow where the user visits a URL and enters a code to grant access. The API key is saved locally at ~/.config/headsdown/credentials.json.",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "headsdown_deferred",
        description: "HeadsDown: review and resolve metadata-only deferred decisions captured during autopilot runs. Actions: list, view, approve, override, refine, dismiss. Outputs derived facts only and never returns raw transcript or question text.",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["list", "view", "approve", "override", "refine", "dismiss"],
              description: "list (default), view, or resolve a deferred decision."
            },
            decision_id: {
              type: "string",
              description: "Deferred decision id for view or resolution actions."
            },
            latest: {
              type: "number",
              description: "Limit to N recent event records before filtering. Defaults to 50."
            }
          },
          required: []
        }
      },
      {
        name: "headsdown_digest",
        description: "View or dismiss the user's HeadsDown digest: aggregated notifications and messages that arrived while they were in focus mode. Returns summaries grouped by source (e.g., Slack messages from a teammate, GitHub PR comments). Call at the start of a session or when the user asks what they missed. After presenting entries, offer to dismiss them. Use action 'dismiss' with an id to clear a specific entry.",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["list", "dismiss"],
              description: "list (default) to view summaries; dismiss to clear a specific entry by id."
            },
            latest: {
              type: "number",
              description: "Limit to N most recent digest summaries (for list). Defaults to 20."
            },
            id: {
              type: "string",
              description: "Digest summary id to dismiss (required for dismiss action)."
            }
          },
          required: []
        }
      },
      {
        name: "headsdown_report",
        description: "Report the outcome of a task that was previously approved via headsdown_propose. Call this when you've finished (or failed, or partially completed) a task. This helps HeadsDown learn and calibrate future verdicts for better accuracy.",
        inputSchema: {
          type: "object",
          properties: {
            outcome: {
              type: "string",
              enum: ["completed", "failed", "partially_completed", "cancelled", "timed_out"],
              description: "What happened with the task."
            },
            error_category: {
              type: "string",
              description: "If failed: category like 'compilation_error', 'test_failure', 'context_limit'."
            },
            tests_passed: {
              type: "boolean",
              description: "Whether the changes pass tests."
            }
          },
          required: ["outcome"]
        }
      },
      {
        name: "headsdown_continuation",
        description: "HeadsDown: Save or load a structured continuation artifact for resumable work sessions. When wrapping up a session, call with action 'save' to persist your progress so the next session can resume where you left off. The next SessionStart hook will detect the continuation and inject it into context.",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["save", "load"],
              description: "Save continuation data or load (and consume) a previous continuation."
            },
            branch: {
              type: "string",
              description: "Current git branch name (for save)."
            },
            completed_steps: {
              type: "array",
              items: { type: "string" },
              description: "Steps that were completed in this session (for save)."
            },
            pending_steps: {
              type: "array",
              items: { type: "string" },
              description: "Steps remaining to be done (for save)."
            },
            dirty_files: {
              type: "array",
              items: { type: "string" },
              description: "Files with uncommitted changes (for save)."
            },
            open_decisions: {
              type: "array",
              items: { type: "string" },
              description: "Decisions or questions that need the user's input (for save)."
            },
            resume_instruction: {
              type: "string",
              description: "A concise instruction for the next session on what to do first (for save)."
            }
          },
          required: ["action"]
        }
      },
      {
        name: "headsdown_interrupt",
        description: "HeadsDown: Check whether it is appropriate to interrupt the user with a question or notification. Call this before asking a non-critical clarifying question mid-task. If allowed is false, use the autoResponse text instead of interrupting. Returns { allowed, reason, autoResponse, guidance }.",
        inputSchema: {
          type: "object",
          properties: {
            handle: {
              type: "string",
              description: "Type of interrupt: 'clarifying_question', 'scope_change', 'error', 'status_update'. Defaults to 'claude-code' if omitted."
            }
          },
          required: []
        }
      },
      {
        name: "headsdown_session_timebox",
        description: "Request more time for the current HeadsDown session timebox using only an opaque session id and requested minute count.",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["request_extension"],
              description: "Action to run. Defaults to request_extension."
            },
            session_id: {
              type: "string",
              description: "Opaque session id from headsdown_status sessionTimeboxPrompt.sessionId."
            },
            requested_extension_minutes: {
              type: "number",
              enum: [15, 30],
              description: "Requested extension length in minutes."
            }
          },
          required: ["session_id", "requested_extension_minutes"]
        }
      },
      {
        name: "headsdown_apply_action",
        description: "Apply a canonical HeadsDown action key for a specific run. This uses backend action semantics, validates against current allowedActionKeys when available, and returns structured errors for unsupported, not-allowed, and missing-input cases.",
        inputSchema: {
          type: "object",
          properties: {
            run_id: { type: "string", description: "Target run id." },
            action_key: {
              type: "string",
              description: "Canonical action key, for example queue_for_morning."
            },
            duration_minutes: {
              type: "number",
              description: "Required for allow_for_duration. Optional for backend actions that include limits."
            },
            reason: {
              type: "string",
              description: "Optional privacy-safe action reason. Do not include prompts, code, file paths, repo names, branch names, logs, terminal output, or message contents."
            },
            idempotency_key: {
              type: "string",
              description: "Optional idempotency key. If omitted, Claude generates a retry-stable key."
            },
            resume_eligible_at: {
              type: "string",
              description: "Optional ISO datetime for queue/resume metadata."
            },
            next_work_window_starts_at: {
              type: "string",
              description: "Optional ISO datetime for queue metadata."
            },
            handoff_available: {
              type: "boolean",
              description: "Optional queue/handoff availability flag."
            },
            handoff_state: {
              type: "string",
              description: "Optional handoff state: saved, missing, unknown."
            },
            handoff_source: {
              type: "string",
              description: "Optional handoff source label. Defaults to claude."
            },
            handoff_kind: { type: "string", description: "Optional handoff kind label." },
            handoff_captured_at: {
              type: "string",
              description: "Optional ISO datetime when handoff was captured."
            },
            handoff_summary: {
              type: "string",
              description: "Privacy-safe local handoff summary. Required when action_key is queue_for_morning or pause_and_summarize. Returned on resume_run."
            }
          },
          required: ["run_id", "action_key"]
        }
      }
    ]
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (activeTracker) {
      activeTracker.recordTurn();
    }
    try {
      switch (name) {
        case "headsdown_status":
          return await handleStatus();
        case "headsdown_propose":
          return await handlePropose(args ?? {});
        case "headsdown_auth":
          return await handleAuth();
        case "headsdown_deferred":
          return await handleDeferred(args ?? {});
        case "headsdown_digest":
          return await handleDigest(args ?? {});
        case "headsdown_report":
          return await handleReport(args ?? {});
        case "headsdown_grants":
          return await handleGrants(args ?? {});
        case "headsdown_override":
          return await handleOverride(args ?? {});
        case "headsdown_continuation":
          return await handleContinuation(args ?? {});
        case "headsdown_interrupt":
          return await handleInterrupt(args ?? {});
        case "headsdown_session_timebox":
          return await handleSessionTimebox(args ?? {});
        case "headsdown_apply_action":
          return await handleApplyAction(args ?? {});
        default:
          return errorResult(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return handleError(error);
    }
  });
  return server;
}
async function handleStatus() {
  const client = await getClient();
  if (!client) {
    return errorResult(
      "Not authenticated with HeadsDown. Run the headsdown_auth tool to connect your account."
    );
  }
  const actorClient = withActorContext(client, "headsdown_status");
  const { contract, schedule: availability } = await actorClient.getAvailability();
  const directive = resolveExecutionDirective({ contract, schedule: availability });
  const wrapUpInstruction = directive?.primaryDirective ?? resolveExecutionInstruction({ contract, schedule: availability });
  const overview = await getAgentControlOverviewCompat(actorClient);
  const renderedHeadsDownCall = overview?.headsdownCall ? renderHeadsDownCall(overview.headsdownCall) : null;
  const activeRun = await getActiveRunStateForSession();
  const currentRun = resolveCurrentRunContext({ activeRun, overview });
  const sessionTimeboxPrompt = resolveSessionTimeboxPrompt({
    sessionSummaries: overview?.sessionSummaries ?? null,
    currentSessionId: process.env.CLAUDE_SESSION_ID,
    thresholdMinutes: availability.wrapUpGuidance?.thresholdMinutes ?? null
  });
  return textResult(
    JSON.stringify(
      {
        authenticated: true,
        // Axis 1: availability mode (user-set)
        mode: contract?.mode ?? null,
        // Axis 2: execution directive (schedule-derived)
        executionDirective: directive ? {
          code: directive.directiveCode,
          primary: directive.primaryDirective,
          summary: directive.summary,
          hardLimits: directive.hardLimits
        } : null,
        // Full objects for callers that need them
        contract,
        availability,
        headsdownCall: overview?.headsdownCall ?? null,
        renderedHeadsDownCall,
        currentRun,
        sessionTimeboxPrompt,
        summary: formatAvailabilitySummary(contract, availability, renderedHeadsDownCall?.title),
        wrapUpInstruction
      },
      null,
      2
    )
  );
}
async function handlePropose(args) {
  const description = args.description;
  if (!description || typeof description !== "string" || !description.trim()) {
    return errorResult("The 'description' parameter is required and must be a non-empty string.");
  }
  const client = await getClient();
  if (!client) {
    return errorResult("Not authenticated with HeadsDown. Run the headsdown_auth tool first.");
  }
  const input = {
    agentRef: "claude-code",
    framework: "claude-code",
    description: description.trim(),
    estimatedFiles: typeof args.estimated_files === "number" ? args.estimated_files : void 0,
    estimatedMinutes: typeof args.estimated_minutes === "number" ? args.estimated_minutes : void 0,
    scopeSummary: typeof args.scope_summary === "string" ? args.scope_summary : void 0,
    sourceRef: typeof args.source_ref === "string" ? args.source_ref : void 0,
    deliveryMode: parseDeliveryMode(args.delivery_mode)
  };
  const actorClient = withActorContext(client, "headsdown_propose");
  const verdict = await actorClient.submitProposal(input);
  if (verdict.decision === "approved") {
    await proposalState.recordApproval({
      id: verdict.proposalId,
      decision: "approved",
      description: input.description,
      evaluatedAt: verdict.evaluatedAt
    });
    try {
      const metaPath = proposalState.filePath.replace(/\.json$/, ".meta.json");
      await writeFile7(
        metaPath,
        JSON.stringify({ estimatedFiles: input.estimatedFiles ?? null }, null, 2),
        { mode: 384 }
      );
    } catch {
    }
    try {
      const config2 = new ConfigStore();
      const configData = await config2.load();
      if (configData.calibration !== false) {
        if (activeTracker) {
          activeTracker.dispose();
          activeTracker = null;
        }
        const tracker = new CalibrationTracker(actorClient, verdict.proposalId, {
          enabled: true
        });
        tracker.start();
        activeTracker = tracker;
      }
    } catch (error) {
      console.error("Calibration setup failed:", error);
    }
    await reportRunStarted(actorClient, {
      proposalId: verdict.proposalId,
      estimatedFiles: input.estimatedFiles,
      estimatedMinutes: input.estimatedMinutes
    });
  }
  const guidance = verdict.decision === "approved" ? "The task was approved. Proceed with the work as described." : "The task was deferred. Inform the user and suggest postponing or reducing scope based on the reason provided.";
  const wrapUpInstruction = resolveExecutionInstruction({
    verdict: {
      decision: verdict.decision,
      reason: verdict.reason,
      wrapUpGuidance: verdict.wrapUpGuidance
    }
  });
  return textResult(
    JSON.stringify(
      {
        decision: verdict.decision,
        reason: verdict.reason,
        guidance,
        proposalId: verdict.proposalId,
        evaluatedAt: verdict.evaluatedAt,
        wrapUpGuidance: verdict.wrapUpGuidance,
        wrapUpInstruction
      },
      null,
      2
    )
  );
}
async function handleAuth() {
  const existingClient = await getClient();
  if (existingClient) {
    try {
      const actorClient = withActorContext(existingClient, "headsdown_auth");
      const profile2 = await actorClient.getProfile();
      return textResult(
        `Already authenticated with HeadsDown as ${profile2.name ?? profile2.email}. Your API key is valid. No action needed.`
      );
    } catch {
    }
  }
  let authDetails;
  const client = await HeadsDownClient.authenticate(
    (auth) => {
      authDetails = auth;
    },
    { label: "Claude Code Extension" }
  );
  const profile = await client.getProfile();
  const lines = [
    "Authentication successful!",
    "",
    `Connected as: ${profile.name ?? profile.email}`,
    `Credentials saved to: ~/.config/headsdown/credentials.json`,
    "",
    "HeadsDown is now active. Use headsdown_status to check availability",
    "and headsdown_propose before starting tasks."
  ];
  if (authDetails) {
    lines.unshift(
      `Device Flow completed for code: ${authDetails.userCode}`,
      `Verification URL: ${authDetails.verificationUriComplete}`,
      ""
    );
  }
  return textResult(lines.join("\n"));
}
async function handleDeferred(args) {
  const client = await getClient();
  if (!client) {
    return errorResult("Not authenticated with HeadsDown. Run the headsdown_auth tool first.");
  }
  try {
    const output = await handleDeferredTool(withActorContext(client, "headsdown_deferred"), args);
    return textResult(JSON.stringify(output, null, 2));
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}
async function handleDigest(args) {
  const client = await getClient();
  if (!client) {
    return errorResult("Not authenticated with HeadsDown. Run the headsdown_auth tool first.");
  }
  const action = typeof args.action === "string" ? args.action : "list";
  const actorClient = withActorContext(client, "headsdown_digest");
  if (action === "dismiss") {
    const id = typeof args.id === "string" ? args.id.trim() : "";
    if (!id) {
      return errorResult("The 'id' parameter is required for action 'dismiss'.");
    }
    const dismissed = await actorClient.dismissDigestEntry(id);
    return textResult(JSON.stringify({ dismissed: true, id: dismissed.id }, null, 2));
  }
  const latest = typeof args.latest === "number" ? args.latest : 20;
  const summaries = await actorClient.listDigestSummaries({ latest });
  if (summaries.length === 0) {
    return textResult(
      JSON.stringify(
        {
          summaries: [],
          message: "No digest entries. Nothing arrived while you were in focus mode."
        },
        null,
        2
      )
    );
  }
  const formatted = summaries.map((s) => ({
    id: s.id,
    from: s.actorLabel,
    source: s.sourceType,
    action: s.action,
    channel: s.channelRef,
    count: s.entryCount,
    firstAt: s.firstEventAt,
    lastAt: s.lastEventAt,
    events: s.events.map((e) => ({
      description: e.description,
      at: e.insertedAt
    }))
  }));
  return textResult(
    JSON.stringify(
      {
        summaries: formatted,
        total: summaries.length,
        message: `${summaries.length} digest ${summaries.length === 1 ? "summary" : "summaries"} from your last focus session.`
      },
      null,
      2
    )
  );
}
async function handleReport(args) {
  const outcome = args.outcome;
  if (!outcome || typeof outcome !== "string") {
    return errorResult("The 'outcome' parameter is required.");
  }
  const validOutcomes = ["completed", "failed", "partially_completed", "cancelled", "timed_out"];
  if (!validOutcomes.includes(outcome)) {
    return errorResult(`Invalid outcome. Must be one of: ${validOutcomes.join(", ")}`);
  }
  const tracker = activeTracker;
  if (!tracker || !tracker.isActive) {
    return errorResult(
      "No active calibration session. Submit a proposal via headsdown_propose first."
    );
  }
  try {
    const extras = {};
    if (typeof args.error_category === "string") extras.errorCategory = args.error_category;
    if (typeof args.tests_passed === "boolean") extras.testsPassed = args.tests_passed;
    const terminalOutcome = outcome;
    await tracker.complete(terminalOutcome, extras);
    const activeRun = await getActiveRunStateForSession();
    const reportingClient = await getClient();
    if (activeRun && reportingClient) {
      const actorClient = withActorContext(reportingClient, "headsdown_report");
      await reportRunOutcome(actorClient, {
        proposalId: activeRun.proposalId,
        outcome: terminalOutcome,
        errorCategory: typeof args.error_category === "string" ? args.error_category : void 0,
        testsPassed: typeof args.tests_passed === "boolean" ? args.tests_passed : void 0
      });
    }
    return textResult(
      JSON.stringify(
        {
          reported: true,
          outcome,
          message: "Outcome recorded. This helps HeadsDown calibrate future verdicts."
        },
        null,
        2
      )
    );
  } catch (error) {
    return handleError(error);
  } finally {
    activeTracker = null;
  }
}
async function handleGrants(args) {
  const client = await getClient();
  if (!client) {
    return errorResult("Not authenticated with HeadsDown. Run the headsdown_auth tool first.");
  }
  const actorClient = withActorContext(client, "headsdown_grants");
  const action = typeof args.action === "string" ? args.action : "list_active";
  try {
    if (action === "list_active") {
      const grants = await actorClient.listActiveDelegationGrants();
      return textResult(JSON.stringify({ grants }, null, 2));
    }
    if (action === "list") {
      const filter = buildDelegationGrantFilterInput(args);
      const hasFilter = Object.values(filter).some((value) => value !== void 0);
      const grants = await actorClient.listDelegationGrants(hasFilter ? filter : void 0);
      return textResult(JSON.stringify({ grants }, null, 2));
    }
    if (action === "create") {
      if (typeof args.scope !== "string") {
        return errorResult("The 'scope' parameter is required for action='create'.");
      }
      if (!Array.isArray(args.permissions) || args.permissions.length === 0) {
        return errorResult("The 'permissions' parameter is required for action='create'.");
      }
      const input = {
        scope: args.scope,
        sessionId: typeof args.session_id === "string" ? args.session_id : void 0,
        workspaceRef: typeof args.workspace_ref === "string" ? args.workspace_ref : void 0,
        agentId: typeof args.agent_id === "string" ? args.agent_id : void 0,
        permissions: args.permissions,
        durationMinutes: typeof args.duration_minutes === "number" ? args.duration_minutes : void 0,
        expiresAt: typeof args.expires_at === "string" ? args.expires_at : void 0,
        source: typeof args.source === "string" ? args.source : "claude-code"
      };
      const grant = await actorClient.createDelegationGrant(input);
      return textResult(JSON.stringify({ grant }, null, 2));
    }
    if (action === "revoke") {
      if (typeof args.id !== "string" || !args.id.trim()) {
        return errorResult("The 'id' parameter is required for action='revoke'.");
      }
      const grant = await actorClient.revokeDelegationGrant(args.id);
      return textResult(JSON.stringify({ grant }, null, 2));
    }
    if (action === "revoke_many") {
      const filter = buildDelegationGrantFilterInput(args);
      const hasFilter = Object.values(filter).some((value) => value !== void 0);
      const result2 = await actorClient.revokeDelegationGrants(hasFilter ? filter : void 0);
      return textResult(JSON.stringify({ result: result2 }, null, 2));
    }
    return errorResult(
      "Invalid action. Must be one of: list_active, list, create, revoke, revoke_many."
    );
  } catch (error) {
    const grantMessage = formatGrantCapabilityError(error);
    if (grantMessage) {
      return errorResult(grantMessage);
    }
    return handleError(error);
  }
}
async function handleOverride(args) {
  const client = await getClient();
  if (!client) {
    return errorResult("Not authenticated with HeadsDown. Run the headsdown_auth tool first.");
  }
  const actorClient = withActorContext(client, "headsdown_override");
  const action = typeof args.action === "string" ? args.action : "get";
  if (action === "get") {
    const override = await actorClient.getActiveAvailabilityOverride();
    return textResult(JSON.stringify({ override }, null, 2));
  }
  if (action === "set") {
    if (typeof args.mode !== "string") {
      return errorResult("The 'mode' parameter is required for action='set'.");
    }
    const override = await actorClient.createAvailabilityOverride(
      availabilityOverrideInput({
        mode: args.mode,
        durationMinutes: typeof args.duration_minutes === "number" ? args.duration_minutes : void 0,
        expiresAt: typeof args.expires_at === "string" ? args.expires_at : void 0,
        reason: typeof args.reason === "string" ? args.reason : void 0,
        source: "claude-code"
      })
    );
    return textResult(JSON.stringify({ override }, null, 2));
  }
  if (action === "clear") {
    const idArg = typeof args.id === "string" ? args.id : void 0;
    const activeOverride = idArg ? null : await actorClient.getActiveAvailabilityOverride();
    const targetId = idArg ?? activeOverride?.id;
    if (!targetId) {
      return textResult(
        JSON.stringify({ override: null, message: "No active override to clear." }, null, 2)
      );
    }
    const override = await actorClient.cancelAvailabilityOverride(
      targetId,
      typeof args.reason === "string" ? args.reason : void 0,
      "claude-code"
    );
    return textResult(JSON.stringify({ override }, null, 2));
  }
  return errorResult("Invalid action. Must be one of: get, set, clear.");
}
function withActorContext(client, toolName) {
  const actorContext = {
    source: "claude-code",
    agentId: "claude-code",
    sessionId: process.env.CLAUDE_SESSION_ID,
    workspaceRef: "unknown"
  };
  if (toolName) {
    actorContext.agentId = `claude-code:${toolName}`;
  }
  return client.withActor(actorContext);
}
function parseDeliveryMode(value) {
  if (value === "auto" || value === "wrap_up" || value === "full_depth") {
    return value;
  }
  return void 0;
}
function resolveExecutionDirective(input) {
  const fn = describeExecutionDirective;
  return typeof fn === "function" ? fn(input) : null;
}
function resolveExecutionInstruction(input) {
  const directive = resolveExecutionDirective(input);
  if (directive) {
    return directive.primaryDirective ?? null;
  }
  const guidance = input.verdict?.wrapUpGuidance ?? input.schedule?.wrapUpGuidance;
  if (!guidance || !guidance.active) {
    return null;
  }
  let instruction = "";
  if (guidance.selectedMode === "wrap_up") {
    instruction = "Execution policy for this task: keep scope minimal, avoid starting new refactors, finish the current slice cleanly, and include clear handoff notes for deferred work.";
  } else if (guidance.selectedMode === "full_depth") {
    instruction = "Execution policy for this task: proceed with full implementation depth, include robust validation and tests, and do not shrink scope only because a deadline is near.";
  } else {
    instruction = "Execution policy for this task: follow the provided context to balance scope and depth, stay focused on the requested outcome, and avoid unnecessary expansion.";
  }
  const context = [];
  if (typeof guidance.remainingMinutes === "number") {
    context.push(
      `About ${guidance.remainingMinutes} minutes remain before the attention deadline.`
    );
  }
  if (guidance.reason) {
    context.push(`Reason: ${guidance.reason}`);
  }
  if (guidance.hints && guidance.hints.length > 0) {
    context.push(`Hints: ${guidance.hints.join("; ")}`);
  }
  return [instruction, ...context].join(" ");
}
function isSessionTokenOnlyGrantError(message) {
  return message.includes("session-token auth path") || message.includes("session-token auth") || message.includes("Delegation grants require session-token auth");
}
function continuationPath() {
  const override = process.env.HEADSDOWN_CONTINUATION_PATH?.trim();
  if (override) return override;
  return join7(homedir5(), ".config", "headsdown", "continuation.json");
}
async function handleContinuation(args) {
  const action = typeof args.action === "string" ? args.action : "";
  if (action === "save") {
    const data = {
      branch: typeof args.branch === "string" ? args.branch : null,
      completedSteps: Array.isArray(args.completed_steps) ? args.completed_steps : [],
      pendingSteps: Array.isArray(args.pending_steps) ? args.pending_steps : [],
      dirtyFiles: Array.isArray(args.dirty_files) ? args.dirty_files : [],
      openDecisions: Array.isArray(args.open_decisions) ? args.open_decisions : [],
      resumeInstruction: typeof args.resume_instruction === "string" ? args.resume_instruction : null,
      savedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await writeContinuationArtifact(data);
    return textResult(JSON.stringify({ saved: true, path: continuationPath(), data }, null, 2));
  }
  if (action === "load") {
    const data = await loadContinuationArtifact({ consume: true });
    if (!data) {
      return textResult(
        JSON.stringify({ found: false, message: "No continuation artifact found." }, null, 2)
      );
    }
    return textResult(JSON.stringify({ found: true, data }, null, 2));
  }
  return errorResult("The 'action' parameter must be 'save' or 'load'.");
}
async function handleInterrupt(args) {
  const client = await getClient();
  if (!client) {
    return errorResult(
      "Not authenticated with HeadsDown. Run the headsdown_auth tool to connect your account."
    );
  }
  const offClockMarker = await getActiveOffClockQueueMarker();
  if (offClockMarker) {
    return textResult(
      JSON.stringify(
        {
          allowed: false,
          reason: "off_the_clock_queued_for_morning",
          autoResponse: "Off the clock. Save the handoff and ask tomorrow.",
          guidance: "Claude Code controls the model. HeadsDown controls the run. This run stays queued until resume_run succeeds or the user explicitly allows continuation.",
          runId: offClockMarker.runId
        },
        null,
        2
      )
    );
  }
  const handle = typeof args.handle === "string" && args.handle.trim() ? args.handle.trim() : "claude-code";
  const actorClient = withActorContext(client, "headsdown_interrupt");
  const result2 = await actorClient.evaluateInterrupt(handle);
  const guidance = result2.allowed ? "You may proceed with the interrupt." : result2.autoResponse ? `Do not interrupt. Respond with: "${result2.autoResponse}"` : "Do not interrupt. Continue working without asking.";
  return textResult(
    JSON.stringify(
      {
        allowed: result2.allowed,
        reason: result2.reason,
        autoResponse: result2.autoResponse,
        guidance
      },
      null,
      2
    )
  );
}
async function handleSessionTimebox(args) {
  const action = typeof args.action === "string" ? args.action : "request_extension";
  if (action !== "request_extension") {
    return errorResult("Invalid action. Must be request_extension.");
  }
  const sessionId = typeof args.session_id === "string" ? args.session_id.trim() : "";
  if (!sessionId) {
    return errorResult("The 'session_id' parameter is required.");
  }
  const requestedExtensionMinutes = typeof args.requested_extension_minutes === "number" ? args.requested_extension_minutes : NaN;
  if (requestedExtensionMinutes !== 15 && requestedExtensionMinutes !== 30) {
    return errorResult("The 'requested_extension_minutes' parameter must be 15 or 30.");
  }
  const client = await getClient();
  if (!client) {
    return errorResult("Not authenticated with HeadsDown. Run the headsdown_auth tool first.");
  }
  const actorClient = withActorContext(client, "headsdown_session_timebox");
  try {
    const result2 = await requestSessionTimeboxExtensionCompat(
      actorClient,
      sessionId,
      requestedExtensionMinutes
    );
    return textResult(JSON.stringify({ ok: true, ...result2 }, null, 2));
  } catch (error) {
    await clearSessionTimeboxPromptFingerprint(process.env.CLAUDE_SESSION_ID);
    throw error;
  }
}
async function handleApplyAction(args) {
  const client = await getClient();
  if (!client) {
    return errorResult("Not authenticated with HeadsDown. Run the headsdown_auth tool first.");
  }
  const actorClient = withActorContext(client, "headsdown_apply_action");
  const now = /* @__PURE__ */ new Date();
  const actionKey = typeof args.action_key === "string" ? args.action_key : "";
  const normalizedActionKey = normalizeStateToken(actionKey);
  const queueForMorning = normalizedActionKey === "queue_for_morning";
  const pauseAndSummarize = normalizedActionKey === "pause_and_summarize";
  const resumeRun = normalizedActionKey === "resume_run";
  const savesHandoff = queueForMorning || pauseAndSummarize;
  const handoffSummary = cleanOptionalText(
    typeof args.handoff_summary === "string" ? args.handoff_summary : null
  );
  if (savesHandoff && !handoffSummary) {
    return errorResult(
      JSON.stringify(
        {
          ok: false,
          error: {
            code: "missing_required_input",
            message: `handoff_summary is required before ${normalizedActionKey} can report a saved handoff.`,
            details: { field: "handoff_summary", actionKey: normalizedActionKey }
          }
        },
        null,
        2
      )
    );
  }
  if (savesHandoff) {
    await writeContinuationArtifact({
      branch: null,
      completedSteps: [],
      pendingSteps: [handoffSummary],
      dirtyFiles: [],
      openDecisions: [
        pauseAndSummarize ? "Re-scope before continuing." : "Resume when back on the clock."
      ],
      resumeInstruction: handoffSummary,
      runId: cleanOptionalText(typeof args.run_id === "string" ? args.run_id : null),
      savedAt: now.toISOString()
    });
  }
  const result2 = await applyCanonicalAction(
    {
      runId: typeof args.run_id === "string" ? args.run_id : "",
      actionKey,
      durationMinutes: typeof args.duration_minutes === "number" ? args.duration_minutes : void 0,
      reason: typeof args.reason === "string" ? args.reason : void 0,
      idempotencyKey: typeof args.idempotency_key === "string" ? args.idempotency_key : void 0,
      resumeEligibleAt: typeof args.resume_eligible_at === "string" ? args.resume_eligible_at : void 0,
      nextWorkWindowStartsAt: typeof args.next_work_window_starts_at === "string" ? args.next_work_window_starts_at : void 0,
      handoffAvailable: typeof args.handoff_available === "boolean" ? args.handoff_available : savesHandoff ? true : void 0,
      handoffState: typeof args.handoff_state === "string" ? args.handoff_state : savesHandoff ? "saved" : void 0,
      handoffSource: typeof args.handoff_source === "string" ? args.handoff_source : savesHandoff ? "claude" : void 0,
      handoffKind: typeof args.handoff_kind === "string" ? args.handoff_kind : pauseAndSummarize ? "pause_summary" : queueForMorning ? "queue_for_morning" : void 0,
      handoffCapturedAt: typeof args.handoff_captured_at === "string" ? args.handoff_captured_at : savesHandoff ? now.toISOString() : void 0
    },
    {
      now: () => now,
      markerStore: createActionMarkerStore(),
      getRunActionContext: async (runId) => {
        const overview = await getAgentControlOverviewCompat(actorClient);
        const runSummary = overview?.runSummaries?.find((run) => run.runId === runId);
        if (!runSummary) return null;
        return {
          sourceState: runSummary.callKey,
          allowedActionKeys: runSummary.allowedActionKeys ?? []
        };
      },
      mutateAction: async (input) => {
        const graphql = getLowLevelGraphQLClient(actorClient);
        if (!graphql) {
          throw new Error("HeadsDown action APIs are unavailable in this @headsdown/sdk version.");
        }
        return graphql.request(APPLY_HEADSDOWN_ACTION_MUTATION2, { input });
      }
    }
  );
  if (!result2.ok) {
    if (savesHandoff) {
      await loadContinuationArtifact({ consume: true });
    }
    return errorResult(JSON.stringify(result2, null, 2));
  }
  const payload = {
    ok: true,
    mutationInput: result2.mutationInput,
    action: result2.payload
  };
  if (queueForMorning) {
    payload.offClock = {
      queuedForMorning: true,
      handoffSaved: true,
      handoffSummary,
      message: "Off the clock. Save the handoff and ask tomorrow."
    };
  }
  if (pauseAndSummarize) {
    payload.handoff = {
      paused: true,
      handoffSaved: true,
      handoffSummary,
      message: "Run paused. Handoff saved for resume."
    };
  }
  if (resumeRun) {
    const handoff = await loadContinuationArtifact({ consume: true });
    payload.offClock = {
      resumed: true,
      handoff,
      message: "Ready to resume. HeadsDown saved the thread so Claude can pick up without starting over."
    };
    await reportRunResumed(actorClient, { runId: String(args.run_id) });
  }
  return textResult(JSON.stringify(payload, null, 2));
}
async function writeContinuationArtifact(data) {
  const path = continuationPath();
  await mkdir6(dirname4(path), { recursive: true });
  await writeFile7(path, JSON.stringify(data, null, 2), { mode: 384 });
}
async function loadContinuationArtifact(options) {
  try {
    await access2(continuationPath());
  } catch {
    return null;
  }
  const raw = await readFile7(continuationPath(), "utf-8");
  const parsed = JSON.parse(raw);
  if (options.consume) {
    await unlink2(continuationPath());
  }
  return parsed;
}
async function getActiveOffClockQueueMarker() {
  const markers = await createActionMarkerStore().listActive();
  const offClockMarker = markers.find(
    (marker) => marker.handoffKind === "queue_for_morning" || marker.attemptByAction?.queue_for_morning
  );
  if (!offClockMarker) {
    return null;
  }
  return { runId: offClockMarker.runId };
}
function normalizeStateToken(value) {
  const cleaned = cleanOptionalText(value);
  if (!cleaned) return null;
  return cleaned.toLowerCase().replace(/-/g, "_");
}
function cleanOptionalText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
function formatGrantCapabilityError(error) {
  if (error instanceof AuthError && isSessionTokenOnlyGrantError(error.message)) {
    return "Delegation grant management requires a session-token auth path and is unavailable for API-key clients.";
  }
  if (error instanceof ApiError && isSessionTokenOnlyGrantError(error.message)) {
    return "Delegation grant management requires a session-token auth path and is unavailable for API-key clients.";
  }
  return null;
}
function buildDelegationGrantFilterInput(args) {
  return {
    active: typeof args.active === "boolean" ? args.active : void 0,
    scope: typeof args.scope === "string" ? args.scope : void 0,
    sessionId: typeof args.session_id === "string" ? args.session_id : void 0,
    workspaceRef: typeof args.workspace_ref === "string" ? args.workspace_ref : void 0,
    agentId: typeof args.agent_id === "string" ? args.agent_id : void 0,
    source: typeof args.source === "string" ? args.source : void 0
  };
}
function availabilityOverrideInput(input) {
  if (input.expiresAt) {
    return {
      mode: input.mode,
      expiresAt: input.expiresAt,
      reason: input.reason,
      source: input.source
    };
  }
  if (typeof input.durationMinutes === "number") {
    return {
      mode: input.mode,
      durationMinutes: input.durationMinutes,
      reason: input.reason,
      source: input.source
    };
  }
  throw new ValidationError(
    "Either duration_minutes or expires_at is required.",
    "duration_minutes"
  );
}
function getCredentialsPathOverride() {
  const value = process.env.HEADSDOWN_CREDENTIALS_PATH;
  if (!value) return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
async function getClient() {
  try {
    const credentialsPath = getCredentialsPathOverride();
    return await HeadsDownClient.fromCredentials(credentialsPath ? { credentialsPath } : void 0);
  } catch {
    return null;
  }
}
function formatAvailabilitySummary(contract, availability, callSummary) {
  const parts = [];
  if (callSummary) {
    parts.push(`HeadsDown call: ${callSummary}`);
  }
  if (!contract) {
    parts.push("Axis 1 \u2014 Availability mode: not set (no active contract).");
  } else {
    parts.push(`Axis 1 \u2014 Availability mode (user-set): ${contract.mode}`);
    if (contract.statusText) {
      const emoji = contract.statusEmoji ? `${contract.statusEmoji} ` : "";
      parts.push(`Status: ${emoji}${contract.statusText}`);
    }
    if (contract.expiresAt) {
      const expires = new Date(contract.expiresAt);
      const now = /* @__PURE__ */ new Date();
      const minutesLeft = Math.round((expires.getTime() - now.getTime()) / 6e4);
      if (minutesLeft > 0) {
        parts.push(`Time remaining: ${minutesLeft} minutes`);
      }
    }
    if (contract.lock) parts.push("Status is locked (user does not want changes)");
    if (contract.autoRespond) parts.push("Auto-respond is enabled");
  }
  const directive = resolveExecutionDirective({ contract, schedule: availability });
  if (directive) {
    parts.push(`Axis 2 \u2014 Execution directive (schedule-derived): ${directive.directiveCode}`);
    parts.push(`Execution directive summary: ${directive.summary}`);
    if (directive.hardLimits.avoidNewRefactors) parts.push("Hard limit: avoid new refactors");
    if (directive.hardLimits.requireHandoffIfIncomplete)
      parts.push("Hard limit: require handoff notes if incomplete");
    if (directive.hardLimits.requireConfirmationBeforeLargeChanges)
      parts.push("Hard limit: confirm before large changes");
  }
  if (availability.inReachableHours) {
    parts.push("Currently in available hours.");
  } else {
    parts.push("Currently outside available hours.");
  }
  if (availability.activeWindow) {
    parts.push(
      `Active availability window: ${availability.activeWindow.label} (${availability.activeWindow.mode})`
    );
  }
  if (availability.wrapUpGuidance?.active) {
    const remaining = availability.wrapUpGuidance.remainingMinutes;
    const reason = availability.wrapUpGuidance.reason;
    const timing = typeof remaining === "number" ? `${remaining} minutes remaining` : "active";
    parts.push(`Wrap-Up guidance: ${timing}`);
    if (reason) {
      parts.push(`Wrap-Up reason: ${reason}`);
    }
  }
  if (availability.nextWindow) {
    parts.push(
      `Next availability window: ${availability.nextWindow.label} (${availability.nextWindow.mode})`
    );
  }
  if (availability.nextTransitionAt) {
    parts.push(`Next availability transition at: ${availability.nextTransitionAt}`);
  }
  return parts.join("\n");
}
function textResult(text) {
  return { content: [{ type: "text", text }] };
}
function errorResult(text) {
  return { content: [{ type: "text", text }], isError: true };
}
function handleError(error) {
  if (error instanceof AuthError) {
    if (isSessionTokenOnlyGrantError(error.message)) {
      return errorResult(
        "Delegation grant management requires a session-token auth path and is unavailable for API-key clients."
      );
    }
    return errorResult(
      `Authentication error: ${error.message}

Run the headsdown_auth tool to re-authenticate.`
    );
  }
  if (error instanceof ValidationError) {
    return errorResult(`Invalid input: ${error.message}`);
  }
  if (error instanceof NetworkError) {
    return errorResult(
      `Could not reach HeadsDown: ${error.message}

Check your network connection and try again.`
    );
  }
  if (error instanceof ApiError) {
    return errorResult(`HeadsDown API error: ${error.message}`);
  }
  const message = error instanceof Error ? error.message : String(error);
  return errorResult(`Unexpected error: ${message}`);
}

// src/index.ts
async function main2() {
  if (process.argv[2] === "referee") {
    await Promise.resolve().then(() => (init_cli2(), cli_exports));
    return;
  }
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main2().catch((error) => {
  console.error("HeadsDown MCP server failed to start:", error);
  process.exit(1);
});
