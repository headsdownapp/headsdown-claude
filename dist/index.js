#!/usr/bin/env node
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/index.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/server.ts
import { writeFile as writeFile6, readFile as readFile6, unlink as unlink2, mkdir as mkdir6, access as access2 } from "node:fs/promises";
import { join as join6, dirname as dirname4 } from "node:path";
import { homedir as homedir5 } from "node:os";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

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
function isRetryableStatus(status) {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
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
    const { randomBytes } = __require("node:crypto");
    return randomBytes(bytes).toString("hex");
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
  async save(config) {
    const dir = join2(this.path, "..");
    await mkdir2(dir, { recursive: true });
    await writeFile2(this.path, JSON.stringify(config, null, 2) + "\n", { mode: 420 });
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
var CalibrationTracker = class {
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

// node_modules/@headsdown/sdk/dist/local-session-summary.js
var SAFE_TOKEN_PATTERN = "^[A-Za-z0-9_.:-]{1,256}$";
var SAFE_TOKEN_REGEX = new RegExp(SAFE_TOKEN_PATTERN);

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

// src/agent-run-progress.ts
function bucketMinutes(minutes) {
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
    estimated_minutes_bucket: bucketMinutes(input.estimatedMinutes),
    estimated_files_bucket: bucketFileCount(input.estimatedFiles ?? void 0),
    delivery_mode: "auto"
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
  return stripUndefined3({
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
function stripUndefined3(value) {
  const entries = Object.entries(value).filter(([, fieldValue]) => fieldValue !== void 0);
  return Object.fromEntries(entries);
}

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

// src/autopilot/wake-up-digest.ts
function deferredDecisionEntryFromEvent(event) {
  const record = event;
  const payload = record.payload && typeof record.payload === "object" ? record.payload : {};
  const summary = payload.local_session_summary && typeof payload.local_session_summary === "object" ? payload.local_session_summary : {};
  const decisionId = stringField(payload.decision_id);
  if (!decisionId) return null;
  return {
    decisionId,
    runId: stringField(record.runId) || "unknown",
    eventId: stringField(record.eventId) || decisionId,
    decisionKind: stringField(payload.decision_kind) || "unknown",
    urgencyBucket: stringField(payload.urgency_bucket) || "normal",
    flaggedForReview: payload.flagged_for_review === true,
    outcomeCategory: stringField(summary.outcomeCategory),
    toolCallCount: numberField(summary.toolCallCount),
    fileChangeCount: numberField(summary.fileChangeCount),
    deferredDecisionCount: numberField(summary.deferredDecisionCount),
    timestamp: stringField(record.occurredAt) || stringField(record.insertedAt) || (/* @__PURE__ */ new Date(0)).toISOString()
  };
}
function summarizeWakeUpDigest(entries) {
  const summary = {
    count: entries.length,
    runIds: [...new Set(entries.map((entry) => entry.runId))].sort(),
    flaggedCount: entries.filter((entry) => entry.flaggedForReview).length,
    urgencyBuckets: {},
    outcomeCategoryBuckets: {},
    latestAt: null
  };
  for (const entry of entries) {
    summary.urgencyBuckets[entry.urgencyBucket] = (summary.urgencyBuckets[entry.urgencyBucket] ?? 0) + 1;
    if (entry.outcomeCategory) {
      summary.outcomeCategoryBuckets[entry.outcomeCategory] = (summary.outcomeCategoryBuckets[entry.outcomeCategory] ?? 0) + 1;
    }
    if (!summary.latestAt || entry.timestamp > summary.latestAt) summary.latestAt = entry.timestamp;
  }
  return summary;
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
function stringField(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function numberField(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// src/headsdown-deferred-tool.ts
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
  const result = await client.reportDeferredDecisionResolved(
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
  if (result?.ok !== true) throw new Error("Could not resolve deferred decision.");
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

// src/headsdown-action-executor.ts
import { readFile as readFile5, writeFile as writeFile5, mkdir as mkdir5 } from "node:fs/promises";
import { dirname as dirname3, join as join5 } from "node:path";
import { homedir as homedir4 } from "node:os";
var CANONICAL_ACTION_KEYS = [
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
var UNSUPPORTED_CANONICAL_ACTIONS = /* @__PURE__ */ new Set(["create_temporary_exception"]);
var ACTIONS_REQUIRING_DURATION = /* @__PURE__ */ new Set(["allow_for_duration"]);
var QUEUED_MARKER_ACTIONS = /* @__PURE__ */ new Set([
  "queue_for_later",
  "queue_for_morning",
  "pause_and_summarize",
  "keep_queued"
]);
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
    mutationInput.handoffState = toGraphQLEnum2(handoffState);
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
function toGraphQLEnum2(value) {
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
var APPLY_HEADSDOWN_ACTION_MUTATION2 = `
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

// src/report-progress-response.ts
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

// src/server.ts
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
      await writeFile6(
        metaPath,
        JSON.stringify({ estimatedFiles: input.estimatedFiles ?? null }, null, 2),
        { mode: 384 }
      );
    } catch {
    }
    try {
      const config = new ConfigStore();
      const configData = await config.load();
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
      const result = await actorClient.revokeDelegationGrants(hasFilter ? filter : void 0);
      return textResult(JSON.stringify({ result }, null, 2));
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
  return join6(homedir5(), ".config", "headsdown", "continuation.json");
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
  const result = await actorClient.evaluateInterrupt(handle);
  const guidance = result.allowed ? "You may proceed with the interrupt." : result.autoResponse ? `Do not interrupt. Respond with: "${result.autoResponse}"` : "Do not interrupt. Continue working without asking.";
  return textResult(
    JSON.stringify(
      {
        allowed: result.allowed,
        reason: result.reason,
        autoResponse: result.autoResponse,
        guidance
      },
      null,
      2
    )
  );
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
  const result = await applyCanonicalAction(
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
  if (!result.ok) {
    if (savesHandoff) {
      await loadContinuationArtifact({ consume: true });
    }
    return errorResult(JSON.stringify(result, null, 2));
  }
  const payload = {
    ok: true,
    mutationInput: result.mutationInput,
    action: result.payload
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
  await writeFile6(path, JSON.stringify(data, null, 2), { mode: 384 });
}
async function loadContinuationArtifact(options) {
  try {
    await access2(continuationPath());
  } catch {
    return null;
  }
  const raw = await readFile6(continuationPath(), "utf-8");
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
async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch((error) => {
  console.error("HeadsDown MCP server failed to start:", error);
  process.exit(1);
});
