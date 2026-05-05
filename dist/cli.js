#!/usr/bin/env node
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/cli.ts
import { readFile as readFile10, writeFile as writeFile9, unlink as unlink3, access as access5 } from "node:fs/promises";
import { join as join11, dirname as dirname6 } from "node:path";
import { homedir as homedir9 } from "node:os";
import { mkdirSync } from "node:fs";

// node_modules/@headsdown/sdk/dist/errors.js
var HeadsDownError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "HeadsDownError";
  }
};
var AuthError = class extends HeadsDownError {
  constructor(message) {
    super(message);
    this.name = "AuthError";
  }
};
var ApiError = class extends HeadsDownError {
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
var NetworkError = class extends HeadsDownError {
  /** The underlying error, if available. */
  cause;
  constructor(message, cause) {
    super(message);
    this.name = "NetworkError";
    this.cause = cause;
  }
};
var ValidationError = class extends HeadsDownError {
  /** The field that failed validation. */
  field;
  constructor(message, field) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
};
var HeadsDownActionApplyError = class extends HeadsDownError {
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
var HeadsDownActionInvalidStateError = class extends HeadsDownActionApplyError {
  constructor(message, options) {
    super(message, options);
    this.name = "HeadsDownActionInvalidStateError";
  }
};
var HeadsDownActionExpiredError = class extends HeadsDownActionApplyError {
  constructor(message, options) {
    super(message, options);
    this.name = "HeadsDownActionExpiredError";
  }
};
var HeadsDownActionFeatureDisabledError = class extends HeadsDownActionApplyError {
  constructor(message, options) {
    super(message, options);
    this.name = "HeadsDownActionFeatureDisabledError";
  }
};
var HeadsDownActionAuthError = class extends HeadsDownActionApplyError {
  constructor(message, options) {
    super(message, options);
    this.name = "HeadsDownActionAuthError";
  }
};

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

// node_modules/@headsdown/sdk/dist/agent-run-events.js
var AGENT_RUN_EVENT_SCHEMA_VERSION = 1;
var AGENT_RUN_EVENT_PRIVACY_MODE = "metadata_only";
var AGENT_RUN_PROGRESS_EVENT_TYPE = "agent_run.progress_reported";
var DEFAULT_CLIENT = {
  kind: "sdk",
  name: "SDK",
  version: "unknown"
};
var DEFAULT_ACTOR = {
  kind: "agent",
  ref: "sdk"
};
var PROHIBITED_KEYS = /* @__PURE__ */ new Set([
  "prompt",
  "prompts",
  "model_response",
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
  "file",
  "files",
  "file_contents",
  "file_path",
  "file_paths",
  "path",
  "paths",
  "repo",
  "repository",
  "repository_name",
  "branch",
  "branch_name",
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
var PROHIBITED_COMPACT_KEYS = new Set(Array.from(PROHIBITED_KEYS, (key) => key.replace(/_/g, "")));
var PROHIBITED_KEY_TOKENS = /* @__PURE__ */ new Set([
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
var UNSAFE_VALUE_PATTERNS = [
  /(?:^|\s)(?:[./~]|[A-Za-z]:\\)[^\s]+/,
  /^[^\s]+\/[^\s]+$/,
  /\b(?:https?|git|ssh):\/\//i,
  /\b(?:stdout|stderr|stacktrace|traceback|diff --git)\b/i,
  /\b(?:secret|api[_-]?key|token|password)\b/i
];
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
  return privacySafeClone(variablesInput, "input");
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
  void privacySafeClone(value, path);
}
function privacySafeClone(value, path) {
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
      if (isProhibitedPrivacyKey(key)) {
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

// node_modules/@headsdown/sdk/dist/auth.js
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
var DEFAULT_BASE_URL = "https://headsdown.app";
var DEFAULT_CREDENTIALS_DIR = join(homedir(), ".config", "headsdown");
var DEFAULT_CREDENTIALS_PATH = join(DEFAULT_CREDENTIALS_DIR, "credentials.json");
var DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
var CredentialStore = class {
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
var DeviceFlow = class {
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
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// node_modules/@headsdown/sdk/dist/graphql.js
var DEFAULT_BASE_URL2 = "https://headsdown.app";
var DEFAULT_TIMEOUT = 3e4;
var GraphQLClient = class {
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
        clearTimeout(timer);
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
  return new Promise((resolve) => setTimeout(resolve, ms));
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
var ENUM_FIELDS = /* @__PURE__ */ new Set([
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
function normalizeEnums(data, parentKey) {
  if (data === null || data === void 0)
    return data;
  if (Array.isArray(data))
    return data.map((item) => normalizeEnums(item, parentKey));
  if (typeof data !== "object")
    return data;
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (isEnumField(key, parentKey) && typeof value === "string") {
      result[key] = normalizeEnumValue(value);
    } else if (isEnumField(key, parentKey) && Array.isArray(value)) {
      result[key] = value.map((item) => typeof item === "string" ? normalizeEnumValue(item) : item);
    } else if (typeof value === "object" && value !== null) {
      result[key] = normalizeEnums(value, key);
    } else {
      result[key] = value;
    }
  }
  return result;
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

// node_modules/@headsdown/sdk/dist/queries.js
var ACTIVE_CONTRACT_QUERY = `
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
var SCHEDULE_QUERY = `
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
var ACTIVE_AVAILABILITY_OVERRIDE_QUERY = `
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
var CREATE_AVAILABILITY_OVERRIDE_MUTATION = `
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
var CANCEL_AVAILABILITY_OVERRIDE_MUTATION = `
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
var AGENT_CONTROL_OVERVIEW_QUERY = `
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
var INTERVENTION_REPLAY_QUERY = `
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
var REPORT_AGENT_RUN_EVENT_MUTATION = `
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
var LIST_AGENT_RUN_EVENTS_QUERY = `
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
var APPLY_HEADSDOWN_ACTION_MUTATION = `
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
var AVAILABILITY_QUERY = `
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
var SUBMIT_PROPOSAL_MUTATION = `
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
var LIST_PROPOSALS_QUERY = `
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
var LIST_PRESETS_QUERY = `
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
var APPLY_PRESET_MUTATION = `
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
var CREATE_CONTRACT_MUTATION = `
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
var PROFILE_QUERY = `
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
var OVERRIDE_VERDICT_MUTATION = `
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
var CREATE_DELEGATION_GRANT_MUTATION = `
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
var LIST_DELEGATION_GRANTS_QUERY = `
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
var ACTIVE_DELEGATION_GRANTS_QUERY = `
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
var REVOKE_DELEGATION_GRANT_MUTATION = `
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
var REVOKE_DELEGATION_GRANTS_MUTATION = `
  mutation RevokeDelegationGrants($filter: DelegationGrantFilterInput) {
    revokeDelegationGrants(filter: $filter) {
      revokedCount
    }
  }
`;
var EVALUATE_INTERRUPT_QUERY = `
  query EvaluateInterrupt($handle: String!) {
    evaluateInterrupt(handle: $handle) {
      allowed
      reason
      autoResponse
    }
  }
`;
var CALIBRATION_PROFILES_QUERY = `
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
var VERDICT_SETTINGS_QUERY = `
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
var UPDATE_VERDICT_SETTINGS_MUTATION = `
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
var DIGEST_SUMMARIES_QUERY = `
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
var DISMISS_DIGEST_ENTRY_MUTATION = `
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
var AUTO_RESPONDER_SETTINGS_QUERY = `
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
var UPDATE_AUTO_RESPONDER_SETTINGS_MUTATION = `
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
var TEAMS_QUERY = `
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
var COMPANY_QUERY = `
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
var TEAM_PRESENCE_QUERY = `
  query TeamPresence($teamId: ID!) {
    teamPresence(teamId: $teamId) {
      userId
      onlineAt
      connectionType
    }
  }
`;
var REPORT_OUTCOME_MUTATION = `
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
var AUTOPILOT_POLICY_QUERY = `
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

// node_modules/@headsdown/sdk/dist/client.js
var HeadsDownClient = class _HeadsDownClient {
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
var WRAP_UP_FIELDS = /* @__PURE__ */ new Set([
  "default_wrap_up_mode",
  "wrap_up_threshold_minutes",
  "delivery_mode",
  "wrapUpGuidance"
]);
var AVAILABILITY_FIELDS = /* @__PURE__ */ new Set([
  "status",
  "statusEmoji",
  "statusText",
  "mode",
  "autoRespond",
  "lock"
]);
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
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== void 0)
      result[key] = value;
  }
  return result;
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

// node_modules/@headsdown/sdk/dist/config.js
import { readFile as readFile2, writeFile as writeFile2, mkdir as mkdir2 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";
var DEFAULT_CONFIG_DIR = join2(homedir2(), ".config", "headsdown");
var DEFAULT_CONFIG_PATH = join2(DEFAULT_CONFIG_DIR, "config.json");
var VALID_TRUST_LEVELS = ["advisory", "active", "guarded"];
var DEFAULT_SENSITIVE_PATHS = [
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
var DEFAULT_CONFIG = {
  trustLevel: "advisory",
  sensitivePaths: DEFAULT_SENSITIVE_PATHS,
  calibration: true
};
var ConfigStore = class {
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
function isValidTrustLevel(value) {
  return typeof value === "string" && VALID_TRUST_LEVELS.includes(value);
}

// node_modules/@headsdown/sdk/dist/proposals.js
import { readFile as readFile3, writeFile as writeFile3, mkdir as mkdir3 } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join3, dirname } from "node:path";
var MAX_AGE_MS = 8 * 60 * 60 * 1e3;
var ProposalStateStore = class {
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
function defaultProposalStatePath() {
  const uid = process.getuid?.() ?? process.pid;
  return join3(tmpdir(), `headsdown-proposals-${uid}.json`);
}

// node_modules/@headsdown/sdk/dist/calibration.js
var DEFAULT_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1e3;
var MIN_CHECKPOINT_INTERVAL_MS = 60 * 1e3;

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

// node_modules/@headsdown/sdk/dist/types.js
var HEADSDOWN_CALL_KEYS = [
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
var HEADSDOWN_ACTION_KEYS = [
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

// node_modules/@headsdown/sdk/dist/agent-control.js
var SAFE_ACTION_ORDER = [
  "keep_queued",
  "pause_and_summarize",
  "queue_for_later",
  "stop_run"
];
var HUMAN_DECISION_SIGNALS = [
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
var KEEP_TIGHT_SIGNALS = [
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
var CONTAINED_SIGNALS = [
  "no_action_needed",
  "runs_within_bounds",
  "zero_pending_asks",
  "limits_holding"
];
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

// node_modules/@headsdown/sdk/dist/autopilot-classifier.js
var AUTOPILOT_CLASSIFIER_VERSION = "1.1.0";
var SEVERITY_TAXONOMY = {
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
var LATITUDE_MAX_SEVERITY = {
  // Intentional: "hold" permits up to permanent actions because the user is assumed available for fast escalation handling.
  hold: "permanent",
  verify: "notable",
  balanced: "notable",
  cautious: "routine",
  lockdown: "none"
};
var CLASSIFIER_FIXTURES = [
  { action: "fetch github.com README", expected: "trivial" },
  { action: "mkdir local/dir", expected: "routine" },
  { action: "npm install in project dir", expected: "routine" },
  { action: "fetch random-blog.tld/x.pdf", expected: "notable" },
  { action: "rm -rf project-subdir", expected: "permanent" },
  { action: "git push origin main", expected: "permanent" },
  { action: "force-push origin main", expected: "critical" },
  { action: "drop database", expected: "critical" },
  { action: "ask_user{recovery, last=edit:failed}", expected: "permanent" },
  { action: "ask_user{tooling_choice, last=bash:succeeded}", expected: "routine" },
  { action: "ask_user{scope_clarification, last=webfetch:succeeded}", expected: "notable" },
  { action: "ask_user{approval_request, last=none:unavailable}", expected: "notable" }
];
var KNOWN_TOOL_KINDS = ["bash", "edit", "webfetch", "mcp", "computer_use"];
var QUESTION_CATEGORIES = [
  "scope_clarification",
  "approval_request",
  "tooling_choice",
  "data_input",
  "recovery_decision",
  "other"
];
var SEVERITY_ORDER = [
  "trivial",
  "routine",
  "notable",
  "permanent",
  "critical"
];
var DEFAULT_ESCALATION_STRATEGY = [
  "try_alternative",
  "try_in_sandbox",
  "defer_to_end_of_run",
  "defer_for_human_review"
];
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

// node_modules/@headsdown/sdk/dist/local-session-summary.js
var LOCAL_SESSION_SUMMARY_VERSION = 1;
var LOCAL_SESSION_SUMMARY_OUTCOME_CATEGORIES = [
  "in_progress",
  "completed",
  "tabled",
  "deferred_for_review"
];
var SAFE_TOKEN_PATTERN = "^[A-Za-z0-9_.:-]{1,256}$";
var SAFE_TOKEN_REGEX = new RegExp(SAFE_TOKEN_PATTERN);
var ISO_DATE_TIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
var LOCAL_SESSION_SUMMARY_FIELD_NAMES = /* @__PURE__ */ new Set([
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
  assertSafeToken(summary2.sessionId, "sessionId");
  assertIsoTimestamp(summary2.generatedAt, "generatedAt");
  assertBoolean(summary2.stale, "stale");
  assertCount(summary2.toolCallCount, "toolCallCount");
  assertCount(summary2.fileChangeCount, "fileChangeCount");
  assertCount(summary2.deferredDecisionCount, "deferredDecisionCount");
  assertBoolean(summary2.continuationArtifactAvailable, "continuationArtifactAvailable");
  assertBoolean(summary2.validationLocallyPassed, "validationLocallyPassed");
  if (summary2.approvedProposalRef !== null) {
    assertSafeToken(summary2.approvedProposalRef, "approvedProposalRef");
  }
  if (typeof summary2.outcomeCategory !== "string" || !LOCAL_SESSION_SUMMARY_OUTCOME_CATEGORIES.includes(summary2.outcomeCategory)) {
    throw new ValidationError("localSessionSummary.outcomeCategory must be a supported enum value.", "outcomeCategory");
  }
}
function assertSafeToken(value, field) {
  if (typeof value !== "string" || value.length === 0 || !SAFE_TOKEN_REGEX.test(value)) {
    throw new ValidationError(`${field} must be a 1-256 character token using only letters, numbers, _, ., :, or -.`, field);
  }
}
function assertIsoTimestamp(value, field) {
  if (typeof value !== "string" || !ISO_DATE_TIME_REGEX.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${field} must be a valid RFC3339 date-time timestamp.`, field);
  }
}
function assertBoolean(value, field) {
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

// node_modules/@headsdown/sdk/dist/agent-rendering.js
var AGENT_UNKNOWN_CALL_SAFE_ACTIONS = [
  "keep_queued",
  "pause_and_summarize",
  "queue_for_later",
  "stop_run"
];
var AGENT_ACTION_LABELS = {
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
var AGENT_CALL_FALLBACK_COPY = {
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

// src/agent-control.ts
var NON_INTERVENTION_KEYS = /* @__PURE__ */ new Set(["good_to_run", "ready_to_resume", "all_contained"]);
var AGENT_CONTROL_OVERVIEW_QUERY2 = `
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
    }
  }
`;
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
  try {
    if (typeof client.getAgentControlOverview === "function") {
      const overview = await client.getAgentControlOverview();
      return overview;
    }
    const graphql = getLowLevelGraphQLClient(client);
    if (!graphql) return null;
    const data = await graphql.request(AGENT_CONTROL_OVERVIEW_QUERY2);
    return data.agentControlOverview ?? null;
  } catch {
    return null;
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

// src/agent-run-state.ts
import { access, mkdir as mkdir4, readFile as readFile4, writeFile as writeFile4 } from "node:fs/promises";
import { dirname as dirname2, join as join4 } from "node:path";
import { homedir as homedir3 } from "node:os";
var DEFAULT_STATE = { runs: {}, activeRunsBySession: {} };
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
async function clearRunState(runId) {
  const state = await readStateFile();
  if (!state.runs[runId]) return;
  delete state.runs[runId];
  for (const [sessionId, activeRunId] of Object.entries(state.activeRunsBySession)) {
    if (activeRunId === runId) delete state.activeRunsBySession[sessionId];
  }
  await writeStateFile(state);
}
function nextSequence(state) {
  return { ...state, sequence: state.sequence + 1 };
}
function currentSessionId() {
  return process.env.CLAUDE_SESSION_ID?.trim() || "default";
}

// src/agent-run-progress.ts
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

// src/agent-run-reporter.ts
async function reportAgentRunEventCompat(client, input) {
  try {
    const result = await client.reportAgentRunEvent(buildSdkEventInput(input));
    return isSuccessfulReportResult(result);
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
function isSuccessfulReportResult(result) {
  if (!result || typeof result !== "object") return true;
  const record = result;
  if (!("ok" in record) && !("error" in record)) return true;
  return record.ok === true && (record.error === null || record.error === void 0);
}
function stripUndefined4(value) {
  const entries = Object.entries(value).filter(([, fieldValue]) => fieldValue !== void 0);
  return Object.fromEntries(entries);
}

// src/agent-run-events.ts
function eventKey(runId, eventType, sequence) {
  return `${runId}:${eventType}:${sequence}`;
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

// src/headsdown-action-executor.ts
import { readFile as readFile5, writeFile as writeFile5, mkdir as mkdir5 } from "node:fs/promises";
import { dirname as dirname3, join as join5 } from "node:path";
import { homedir as homedir4 } from "node:os";
var EMPTY_MARKER_STORE = { markers: {} };
var LocalActionMarkerStore = class {
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

// src/autopilot/detect-deferral-handler.ts
import { open, access as access4 } from "node:fs/promises";
import { join as join8 } from "node:path";
import { homedir as homedir7 } from "node:os";

// src/autopilot/deferral.ts
import { createHash, randomBytes } from "node:crypto";
import { access as access2, readFile as readFile6 } from "node:fs/promises";
import { join as join6 } from "node:path";
import { homedir as homedir5 } from "node:os";
var DEFAULT_DETECTION_PATTERNS = [
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
    await access2(configPath);
  } catch {
    return normalizeAutopilotDeferralConfig(null);
  }
  try {
    return normalizeAutopilotDeferralConfig(JSON.parse(await readFile6(configPath, "utf-8")));
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
  return `h_${createHash("sha256").update(trimmed).digest("hex").slice(0, 40)}`;
}
function deferralKey(input) {
  const messageHash = createHash("sha1").update(input.message.slice(0, 2e3)).digest("hex");
  const localHash = createHash("sha1").update(`${input.turnIndex}:${input.patternKey}:${messageHash}`).digest("hex");
  return `${safeSummaryToken(input.runId)}:${localHash}`;
}
function decisionIdForDeferralKey(key) {
  return `decision_${createHash("sha1").update(key).digest("hex").slice(0, 32)}`;
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
  return join6(homedir5(), ".config", "headsdown", "autopilot-config.json");
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

// src/autopilot/state.ts
import { access as access3, chmod, mkdir as mkdir6, readFile as readFile7, writeFile as writeFile6 } from "node:fs/promises";
import { dirname as dirname4, join as join7 } from "node:path";
import { homedir as homedir6 } from "node:os";
var DEFAULT_AUTOPILOT_STATE = {
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
function autopilotStatePath() {
  const override = process.env.HEADSDOWN_AUTOPILOT_STATE_PATH?.trim();
  if (override) return override;
  return join7(homedir6(), ".config", "headsdown", "autopilot-state.json");
}
var AutopilotStateStore = class {
  constructor(path = autopilotStatePath()) {
    this.path = path;
  }
  async load() {
    try {
      await access3(this.path);
    } catch {
      return { ...DEFAULT_AUTOPILOT_STATE, surfacedDecisionIds: [] };
    }
    try {
      const raw = await readFile7(this.path, "utf-8");
      return normalizeAutopilotState(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_AUTOPILOT_STATE, surfacedDecisionIds: [] };
    }
  }
  async save(state) {
    await mkdir6(dirname4(this.path), { recursive: true });
    await writeFile6(this.path, JSON.stringify(normalizeAutopilotState(state), null, 2), {
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
function normalizeAutopilotState(value) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    lastObservedMode: normalizeMode(raw.lastObservedMode),
    lastNudgedAt: normalizeNullableTimestamp(raw.lastNudgedAt),
    surfacedDecisionIds: Array.isArray(raw.surfacedDecisionIds) ? raw.surfacedDecisionIds.filter((id) => typeof id === "string") : [],
    deferredDecisionCount: normalizeCount(raw.deferredDecisionCount),
    consecutiveNudges: normalizeCount(raw.consecutiveNudges),
    lastNudgedRunId: typeof raw.lastNudgedRunId === "string" && raw.lastNudgedRunId.trim() ? raw.lastNudgedRunId.trim() : null,
    lastNudgedToolCallCount: typeof raw.lastNudgedToolCallCount === "number" && Number.isFinite(raw.lastNudgedToolCallCount) && raw.lastNudgedToolCallCount >= 0 ? Math.floor(raw.lastNudgedToolCallCount) : null,
    lastSeenDeferralKey: typeof raw.lastSeenDeferralKey === "string" && raw.lastSeenDeferralKey.trim() ? raw.lastSeenDeferralKey.trim() : null,
    modeCachedAt: normalizeNullableTimestamp(raw.modeCachedAt),
    modeCacheValue: normalizeMode(raw.modeCacheValue)
  };
}
function normalizeMode(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function normalizeNullableTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function normalizeCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

// src/autopilot/detect-deferral-handler.ts
var MAX_TRANSCRIPT_TAIL_BYTES = 1024 * 1024;
async function runDetectDeferralFromStdin() {
  const raw = await readStdin();
  if (!raw.trim()) return { recorded: false, skippedReason: "empty_input" };
  try {
    const result = await handleDetectDeferral(JSON.parse(raw));
    if (result.stderr) console.error(result.stderr);
    if (result.exitCode && result.exitCode !== 0) process.exit(result.exitCode);
    return result;
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
  const mode = normalizeMode2(availability.contract?.mode);
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
    await access4(path);
    return true;
  } catch {
    return false;
  }
}
function defaultContinuationPath() {
  const override = process.env.HEADSDOWN_CONTINUATION_PATH?.trim();
  if (override) return override;
  return join8(homedir7(), ".config", "headsdown", "continuation.json");
}
function safeEventToken(value) {
  return /^[A-Za-z0-9_.:-]{1,256}$/.test(value) ? value : safeSummaryToken(value);
}
function normalizeMode2(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// src/autopilot/intercept-ask-handler.ts
var DENY_REASON = "[HeadsDown autopilot] Defer this question to the deferred-decision queue and continue with what you can do. Do not call AskUserQuestion.";
async function runInterceptAskFromStdin() {
  const raw = await readStdin2();
  if (!raw.trim()) return { denied: false, recorded: false, skippedReason: "empty_input" };
  try {
    const result = await handleInterceptAsk(JSON.parse(raw));
    if (result.output) console.log(JSON.stringify(result.output));
    return result;
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
  const mode = normalizeMode3(availability.contract?.mode);
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
function normalizeMode3(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
async function readStdin2() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// src/autopilot/prompt-handler.ts
async function runAutopilotPromptFromStdin(args = process.argv.slice(4)) {
  const raw = await readStdin3();
  const input = parseHookInput(raw);
  const result = await handleAutopilotPrompt(input, {
    asSessionContext: args.includes("--as-session-context")
  });
  if (result.output) {
    process.stdout.write(`${JSON.stringify(result.output)}
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
  const mode = normalizeMode4(availability.contract?.mode);
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
function normalizeMode4(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
async function readStdin3() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// src/autopilot/wake-up-digest.ts
function detectModeTransition(prev, curr) {
  const previous = normalizeMode5(prev);
  const current = normalizeMode5(curr);
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
function normalizeMode5(value) {
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

// src/autopilot/wake-up-handler.ts
async function runWakeUpFromStdin() {
  await readStdin4();
  const result = await handleWakeUp();
  if (result.output) console.log(JSON.stringify(result.output));
  return result;
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

// src/hooks/index.ts
import { spawn as spawn2 } from "node:child_process";

// src/hooks/post-tool-use.ts
import { tmpdir as tmpdir2 } from "node:os";
import { join as join9 } from "node:path";

// src/hooks/runtime.ts
import { spawn } from "node:child_process";
import { readFile as readFile8, writeFile as writeFile7 } from "node:fs/promises";
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
    return await new Promise((resolve, reject) => {
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
      child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
      if (input !== void 0) child.stdin?.end(input);
    });
  };
}
async function runCliJson(runner, args, fallback) {
  const result = await runner(args);
  if (result.code !== 0 || !result.stdout) return fallback;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return fallback;
  }
}
function outputJson(payload) {
  if (payload === void 0 || payload === null) return;
  process.stdout.write(`${JSON.stringify(payload)}
`);
}
function asRecord(value) {
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
    const value = (await readFile8(path, "utf-8")).trim();
    return /^\d+$/.test(value) ? Number.parseInt(value, 10) : 0;
  } catch {
    return 0;
  }
}
async function writeCounter(path, value) {
  await writeFile7(path, String(value));
}

// src/hooks/post-tool-use.ts
async function postToolUseHandler(input, runner) {
  const hookInput = parseJsonObject(input);
  const toolName = stringField2(hookInput.tool_name) || stringField2(hookInput.toolName);
  const toolType = classifyTool(toolName);
  const sessionId = process.env.CLAUDE_SESSION_ID || "default";
  const counterFile = join9(tmpdir2(), `headsdown-file-count-${sessionId}`);
  const current = await readCounter(counterFile);
  const count = toolType === "write" ? current + 1 : current;
  if (toolType === "write") await writeCounter(counterFile, count);
  const proposal = asRecord(await runCliJson(runner, ["proposals"], null));
  const estimatedFiles = integerField(proposal?.estimatedFiles) ?? 0;
  const progress = await runProgress(runner, toolType, count);
  let message = `[HeadsDown] ${count} file(s) modified this session.`;
  let emitSystemMessage = toolType === "write";
  const contexts = [];
  if (estimatedFiles > 0 && count > Math.floor(estimatedFiles * 3 / 2)) {
    message += ` Scope warning: approved proposal estimated ${estimatedFiles} file(s), ${count} have been modified. Consider calling headsdown_propose with updated estimates.`;
  }
  const progressRecord = asRecord(progress.payload);
  if (progressRecord && boolField(progressRecord.attentionWindowClosing)) {
    const attentionWindow = asRecord(progressRecord.attentionWindow);
    const allowedActions = arrayOfStrings(progressRecord.allowedActionKeys);
    const runId = stringField2(progressRecord.runId);
    const source = stringField2(attentionWindow?.source);
    const deadlineAt = stringField2(attentionWindow?.deadlineAt);
    const thresholdMinutes = stringValue(attentionWindow?.thresholdMinutes);
    const remainingMinutes = stringValue(attentionWindow?.remainingMinutes);
    const hintsText = arrayOfStrings(attentionWindow?.hints).join("; ");
    const wrapSupported = allowedActions.includes("pause_and_summarize");
    const allowDurationSupported = allowedActions.includes("allow_for_duration");
    if (source === "time_box" && !wrapSupported && !allowDurationSupported) {
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
        "HeadsDown call: Window closing. Do not autonomously call headsdown_apply_action with action_key pause_and_summarize for this call. The user must invoke /headsdown:wrap explicitly. You may call headsdown_apply_action with action_key allow_for_duration only if the user explicitly asks for an extension."
      ];
      if (runId) {
        parts.push(`Target run_id: ${runId}.`);
      } else {
        parts.push(
          "If run_id is missing, call headsdown_status to re-establish the target run before applying actions."
        );
      }
      if (wrapSupported) parts.push("Wrap action is currently allowed.");
      if (allowDurationSupported) parts.push("Extend action is currently allowed.");
      if (source === "time_box") parts.push("Active box deadline is driving this warning.");
      appendLabeled(parts, "Deadline", deadlineAt);
      appendLabeled(parts, "Remaining minutes", remainingMinutes);
      appendLabeled(parts, "Warning threshold minutes", thresholdMinutes);
      appendLabeled(parts, "Current wrap-up hints", hintsText);
      contexts.push(parts.join(" "));
      if (toolType === "write") {
        message += " Window closing is active. Use /headsdown:extend to request more time or /headsdown:wrap to pause and summarize.";
      }
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
    return { systemMessage: message, hookSpecificOutput: { additionalContext } };
  }
  if (emitSystemMessage) return { systemMessage: message };
  if (additionalContext) return { hookSpecificOutput: { additionalContext } };
  return void 0;
}
function classifyTool(toolName) {
  if (["Read", "Grep", "Glob", "LS"].includes(toolName)) return "read";
  if (["Write", "Edit", "MultiEdit"].includes(toolName)) return "write";
  return "external";
}
async function runProgress(runner, toolType, count) {
  const result = await runner(["report-progress", toolType, String(count)]);
  if (result.code !== 0) {
    return {
      payload: null,
      error: ["HeadsDown progress command failed.", result.stderr].filter(Boolean).join(" ")
    };
  }
  if (!result.stdout) return { payload: null, error: "" };
  try {
    return { payload: JSON.parse(result.stdout), error: "" };
  } catch {
    return { payload: null, error: "HeadsDown progress command returned invalid JSON." };
  }
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

// src/hooks/index.ts
var SESSION_END_REASONS = /* @__PURE__ */ new Set([
  "clear",
  "resume",
  "logout",
  "prompt_input_exit",
  "bypass_permissions_disabled",
  "other"
]);
var SAFE_SESSION_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,256}$/;
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
  const queuedMarker = asRecord(await runCliJson(runner, ["action-marker", "active"], null));
  const queuedRunId = stringField2(queuedMarker?.runId);
  if (queuedRunId) {
    const handoffState = stringField2(queuedMarker?.handoffState) || "unknown";
    const attemptByAction = asRecord(queuedMarker?.attemptByAction);
    const queuedAction = attemptByAction?.queue_for_morning ? "queue_for_morning" : stringField2(queuedMarker?.handoffKind) || "unknown";
    const systemMessage = queuedAction === "queue_for_morning" ? `[HeadsDown] Off the clock. Save the handoff and ask tomorrow. Run ${queuedRunId} is queued (handoff: ${handoffState}). Do not continue or ask again until resume_run succeeds or the user explicitly allows continuation. Claude Code controls the model. HeadsDown controls the run.` : `[HeadsDown] Queued run ${queuedRunId} is waiting. Handoff state: ${handoffState}. Do not continue or ask again until HeadsDown returns resume_run or the user explicitly resumes the run.`;
    return { systemMessage };
  }
  const statusResult = await runner(["status"]);
  if (statusResult.code !== 0 || !statusResult.stdout) return void 0;
  const status2 = asRecord(parseJsonObject(statusResult.stdout));
  if (!status2) return void 0;
  const contract = asRecord(status2.contract);
  const availability = asRecord(status2.availability);
  const renderedCall = asRecord(status2.renderedHeadsDownCall);
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
    const activeWindow = asRecord(availability.activeWindow);
    const activeWindowLabel = stringField2(activeWindow?.label);
    if (activeWindowLabel) context += ` Active window: ${activeWindowLabel}.`;
    const wrapUpGuidance = asRecord(availability.wrapUpGuidance);
    if (typeof wrapUpGuidance?.remainingMinutes === "number") {
      context += ` Remaining attention budget: ${wrapUpGuidance.remainingMinutes} minutes.`;
    }
  }
  const executionDirective = asRecord(status2.executionDirective);
  const executionDirectiveCode = stringField2(executionDirective?.code);
  const executionDirectiveSummary = stringField2(executionDirective?.summary);
  if (executionDirectiveCode) {
    context += ` Axis 2 (execution directive, schedule-derived): ${executionDirectiveCode}.`;
    if (executionDirectiveSummary) context += ` ${executionDirectiveSummary}`;
  }
  const wrapUpInstruction = stringField2(status2.wrapUpInstruction);
  if (wrapUpInstruction) context += ` Execution guidance: ${wrapUpInstruction}`;
  const transition = asRecord(await runCliJson(runner, ["next-window"], null));
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
  const wakeUp = asRecord(await runCliJson(runner, ["autopilot", "wake-up"], null));
  const wakeUpContext = stringField2(asRecord(wakeUp?.hookSpecificOutput)?.additionalContext);
  const autopilotPrompt = asRecord(
    await runCliJson(runner, ["autopilot", "prompt", "--as-session-context"], null)
  );
  const autopilotPromptContext = stringField2(
    asRecord(autopilotPrompt?.hookSpecificOutput)?.additionalContext
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
  const queuedMarker = asRecord(await runCliJson(runner, ["action-marker", "active"], null));
  const queuedRunId = stringField2(queuedMarker?.runId);
  if (queuedRunId) {
    const handoffState = stringField2(queuedMarker?.handoffState) || "unknown";
    return {
      hookSpecificOutput: { permissionDecision: "deny" },
      systemMessage: `[HeadsDown] Run ${queuedRunId} is queued. Handoff state: ${handoffState}. Do not continue, modify files, or ask again until HeadsDown returns resume_run or the user explicitly resumes the run.`
    };
  }
  const hookInput = parseJsonObject(input);
  const toolInput = asRecord(hookInput.tool_input) ?? asRecord(hookInput.toolInput);
  const filePath = stringField2(toolInput?.file_path) || stringField2(toolInput?.path) || stringField2(toolInput?.filePath);
  const config2 = asRecord(
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
  const status2 = asRecord(await runCliJson(runner, ["status"], null));
  if (!status2) return void 0;
  const contract = asRecord(status2.contract);
  const mode = stringField2(contract?.mode) || "none";
  const statusText = stringField2(contract?.statusText);
  const statusLabel = statusText ? ` (${statusText})` : "";
  const lock = contract?.lock === true;
  const trustLevel = stringField2(config2?.trustLevel) || "advisory";
  const proposalCheck = trustLevel === "active" || trustLevel === "guarded" ? await runner(["proposals", "--check"]) : null;
  const hasProposal = proposalCheck?.code === 0;
  const proposal = hasProposal ? asRecord(await runCliJson(runner, ["proposals"], null)) : null;
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
  const proposal = asRecord(await runCliJson(runner, ["proposals"], null));
  const status2 = asRecord(await runCliJson(runner, ["status"], null));
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
  const result = await runner(args);
  if (result.code !== 0 || !result.stdout) return void 0;
  return parseJsonObject(result.stdout);
}
async function stopDetectDeferralHandler(runner) {
  const result = await runner(["autopilot", "detect-deferral"]);
  if (result.code === 2) {
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = 2;
  }
  if (result.stdout) return parseJsonObject(result.stdout);
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

// src/time-box-store.ts
import { mkdir as mkdir7, readFile as readFile9, unlink as unlink2, writeFile as writeFile8 } from "node:fs/promises";
import { createHash as createHash2 } from "node:crypto";
import { dirname as dirname5, join as join10 } from "node:path";
import { homedir as homedir8 } from "node:os";
var LocalTimeBoxStore = class {
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
    await mkdir7(dirname5(this.filePath), { recursive: true });
    await writeFile8(this.filePath, JSON.stringify(state, null, 2), { mode: 384 });
  }
  async load() {
    let raw;
    try {
      raw = await readFile9(this.filePath, "utf-8");
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
      await unlink2(this.filePath);
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return true;
      throw new Error(`Could not clear HeadsDown box at ${this.filePath}: ${errorMessage(error)}`);
    }
  }
};
function defaultSessionIdHash(env = process.env) {
  const sessionId = clean2(env.CLAUDE_SESSION_ID) ?? "default";
  return hashSessionId(sessionId);
}
function defaultTimeBoxPath(env = process.env) {
  const override = clean2(env.HEADSDOWN_TIME_BOX_PATH);
  if (override) return override;
  return join10(homedir8(), ".config", "headsdown", `time-box-${defaultSessionIdHash(env)}.json`);
}
function hashSessionId(sessionId) {
  return createHash2("sha256").update(sessionId).digest("hex").slice(0, 16);
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

// src/time-box.ts
var DEFAULT_TIME_BOX_THRESHOLD_MINUTES = 15;
var MINUTES_PER_HOUR = 60;
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
  const remainingMinutes = minutesUntil(state.expiresAt, now);
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
  const remaining = minutesUntil(state.expiresAt, now);
  return `HeadsDown box set for ${state.durationMinutes} minutes. Deadline: ${formatTimeBoxClock(state.expiresAt)}. Remaining minutes: ${remaining}.`;
}
function formatTimeBoxStatus(state, now = /* @__PURE__ */ new Date()) {
  const remaining = minutesUntil(state.expiresAt, now);
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
    remainingMinutes: minutesUntil(deadlineAt, now),
    hints: [
      "Self-declared box is active. Keep scope tight before the deadline; do not stop automatically when it passes."
    ],
    source: "time_box"
  };
}
function resolveTimeBoxThresholdMinutes(durationMinutes) {
  return Math.min(DEFAULT_TIME_BOX_THRESHOLD_MINUTES, Math.max(1, durationMinutes));
}
function minutesUntil(value, now) {
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
    now: input.now
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
    now: input.now
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
  return attentionWindowClosing ? {
    attentionWindowClosing: true,
    attentionWindow: buildAttentionWindowState(effectiveAttentionWindow)
  } : {
    attentionWindowClosing: false,
    attentionWindow: null
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

// src/cli.ts
var command = process.argv[2];
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
    const actorClient = withActorContext(client, "cli-status");
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
        summary: contract && availability ? formatSummary(contract, availability, renderedHeadsDownCall?.title) : null,
        wrapUpInstruction: contract && availability ? resolveExecutionInstruction({
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
  const actorClient = withActorContext(client, "cli-summary");
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
      const metaRaw = await readFile10(metaPath, "utf-8");
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
  const actorClient = withActorContext(client, "cli-next-window");
  const { schedule: availability } = await actorClient.getAvailability();
  const { nextTransitionAt, nextWindow: next, wrapUpGuidance } = availability;
  if (!nextTransitionAt) {
    console.log(JSON.stringify(null));
    return;
  }
  const transitionAt = new Date(nextTransitionAt);
  const now = /* @__PURE__ */ new Date();
  const minutesUntil2 = Math.round((transitionAt.getTime() - now.getTime()) / 6e4);
  if (minutesUntil2 < 0 || minutesUntil2 > 60) {
    console.log(JSON.stringify(null));
    return;
  }
  console.log(
    JSON.stringify({
      nextWindowLabel: next?.label ?? null,
      nextWindowMode: next?.mode ?? null,
      minutesUntil: minutesUntil2,
      wrapUpThresholdMinutes: wrapUpGuidance.thresholdMinutes ?? null
    })
  );
}
async function digestCount() {
  const client = await HeadsDownClient.fromCredentials();
  const actorClient = withActorContext(client, "cli-digest-count");
  const summaries = await actorClient.listDigestSummaries({ latest: 50 });
  console.log(String(summaries.length));
}
var CONTINUATION_PATH = join11(homedir9(), ".config", "headsdown", "continuation.json");
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
      mkdirSync(dirname6(CONTINUATION_PATH), { recursive: true });
      await writeFile9(CONTINUATION_PATH, data, { mode: 384 });
      break;
    }
    case "load": {
      const raw = await readFile10(CONTINUATION_PATH, "utf-8");
      console.log(raw);
      await unlink3(CONTINUATION_PATH);
      break;
    }
    case "check": {
      try {
        await access5(CONTINUATION_PATH);
      } catch {
        process.exit(1);
      }
      break;
    }
    default:
      process.exit(1);
  }
}
function resolveExecutionInstruction(input) {
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
function withActorContext(client, commandName) {
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
  const wrapUpInstruction = resolveExecutionInstruction({
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
    await access5(CONTINUATION_PATH);
    outcome = "partially_completed";
  } catch {
  }
  try {
    const client = await HeadsDownClient.fromCredentials();
    const actorClient = withActorContext(client, "cli-report");
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
    const actorClient = withActorContext(client, "cli-report-progress");
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
          timeBox: timeBoxLoad.state
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
          timeBox: timeBoxLoad.state
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
main().catch((error) => {
  if (error instanceof AuthError) {
    process.exit(1);
  }
  process.exit(1);
});
