import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  HeadsDownClient,
  CredentialStore,
  ProposalStateStore,
  AuthError,
  ApiError,
  NetworkError,
  ValidationError,
  CalibrationTracker,
  ConfigStore,
} from "@headsdown/sdk";
import type {
  ActorContext,
  Contract,
  DelegationGrant,
  DelegationGrantFilterInput,
  DelegationGrantInput,
  DelegationGrantPermission,
  DelegationGrantScope,
  DeviceAuthorization,
  DigestSummary,
  ProposalInput,
  ScheduleResolution,
} from "@headsdown/sdk";

const proposalState = new ProposalStateStore();
let activeTracker: CalibrationTracker | null = null;

interface AvailabilityOverride {
  id: string;
  mode: "online" | "busy" | "limited" | "offline";
  reason: string | null;
  source: string;
  expiresAt: string;
  cancelledAt: string | null;
  expiredAt: string | null;
  createdById: string;
  cancelledById: string | null;
  insertedAt: string;
  updatedAt: string;
}

const ACTIVE_AVAILABILITY_OVERRIDE_QUERY = `
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

const CREATE_AVAILABILITY_OVERRIDE_MUTATION = `
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

const CANCEL_AVAILABILITY_OVERRIDE_MUTATION = `
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

export function createServer(): Server {
  const server = new Server(
    { name: "headsdown", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "headsdown_status",
        description:
          "Check the user's current availability on HeadsDown. Returns their focus mode " +
          "(online/busy/limited/offline), status message, time remaining, and availability state. " +
          "Call this before starting any significant task to understand whether the user is " +
          "available, in focus mode, or away. If the user is in 'busy' or 'limited' mode, " +
          "respect their focus time and scope work accordingly.",
        inputSchema: {
          type: "object" as const,
          properties: {},
          required: [],
        },
      },
      {
        name: "headsdown_propose",
        description:
          "Submit a task proposal to HeadsDown for a verdict before starting work. " +
          "HeadsDown evaluates the proposal against the user's current availability and " +
          "returns APPROVED (proceed normally) or DEFERRED (suggest postponing or reducing " +
          "scope). Always call headsdown_status first, then submit a proposal for any " +
          "non-trivial task. Include a clear description of what you plan to do.",
        inputSchema: {
          type: "object" as const,
          properties: {
            description: {
              type: "string",
              description:
                "What you plan to do. Be specific: " +
                "'Refactor auth module to use JWT tokens' not 'make changes'.",
            },
            estimated_files: {
              type: "number",
              description: "Estimated number of files you'll modify.",
            },
            estimated_minutes: {
              type: "number",
              description: "Estimated time in minutes to complete the task.",
            },
            scope_summary: {
              type: "string",
              description: "Brief summary of the scope: which modules, what kind of changes.",
            },
            source_ref: {
              type: "string",
              description: "Reference to the task source: ticket number, PR URL, or description.",
            },
          },
          required: ["description"],
        },
      },
      {
        name: "headsdown_grants",
        description:
          "Manage HeadsDown delegation grants for actor-scoped authorization. Supports listing active grants, " +
          "listing/filtering, creating grants, and revoking grants.",
        inputSchema: {
          type: "object" as const,
          properties: {
            action: {
              type: "string",
              enum: ["list_active", "list", "create", "revoke", "revoke_many"],
              description: "Action to run. Defaults to list_active.",
            },
            id: {
              type: "string",
              description: "Grant id for action='revoke'.",
            },
            scope: {
              type: "string",
              enum: ["session", "workspace", "agent"],
              description: "Scope for create/list/revoke_many.",
            },
            session_id: {
              type: "string",
              description: "Session id for session scope.",
            },
            workspace_ref: {
              type: "string",
              description: "Workspace reference for workspace scope.",
            },
            agent_id: {
              type: "string",
              description: "Agent id for agent scope.",
            },
            permissions: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "availability_override_create",
                  "availability_override_cancel",
                  "preset_apply",
                ],
              },
              description: "Permissions for action='create'.",
            },
            duration_minutes: {
              type: "number",
              description: "Relative expiry in minutes for action='create'.",
            },
            expires_at: {
              type: "string",
              description: "Absolute ISO expiry for action='create'.",
            },
            source: {
              type: "string",
              description: "Audit source label for create/list/revoke_many.",
            },
            active: {
              type: "boolean",
              description: "Active filter for list/revoke_many.",
            },
          },
          required: [],
        },
      },
      {
        name: "headsdown_override",
        description:
          "Manage temporary HeadsDown availability overrides. Supports getting active override, setting one, " +
          "and clearing an active override.",
        inputSchema: {
          type: "object" as const,
          properties: {
            action: {
              type: "string",
              enum: ["get", "set", "clear"],
              description: "Action to run. Defaults to get.",
            },
            id: {
              type: "string",
              description: "Override id for clear (optional; active override is used if omitted).",
            },
            mode: {
              type: "string",
              enum: ["online", "busy", "limited", "offline"],
              description: "Override mode for action='set'.",
            },
            duration_minutes: {
              type: "number",
              description: "Relative expiry in minutes for action='set'.",
            },
            expires_at: {
              type: "string",
              description: "Absolute ISO expiry for action='set'.",
            },
            reason: {
              type: "string",
              description: "Optional reason for set/clear.",
            },
          },
          required: [],
        },
      },
      {
        name: "headsdown_auth",
        description:
          "Authenticate with HeadsDown using Device Flow. Run this if other HeadsDown " +
          "tools report authentication errors. Starts an authorization flow where the user " +
          "visits a URL and enters a code to grant access. The API key is saved locally " +
          "at ~/.config/headsdown/credentials.json.",
        inputSchema: {
          type: "object" as const,
          properties: {},
          required: [],
        },
      },
      {
        name: "headsdown_digest",
        description:
          "View the user's HeadsDown digest: aggregated notifications and messages that arrived " +
          "while they were in focus mode. Returns summaries grouped by source (e.g., Slack " +
          "messages from a teammate, GitHub PR comments). Call this at the start of a session " +
          "or when the user asks what they missed. Read-only; does not dismiss or acknowledge entries.",
        inputSchema: {
          type: "object" as const,
          properties: {
            latest: {
              type: "number",
              description: "Limit to N most recent digest summaries. Defaults to 20.",
            },
          },
          required: [],
        },
      },
      {
        name: "headsdown_report",
        description:
          "Report the outcome of a task that was previously approved via headsdown_propose. " +
          "Call this when you've finished (or failed, or partially completed) a task. " +
          "This helps HeadsDown learn and calibrate future verdicts for better accuracy.",
        inputSchema: {
          type: "object" as const,
          properties: {
            outcome: {
              type: "string",
              enum: ["completed", "failed", "partially_completed", "cancelled", "timed_out"],
              description: "What happened with the task.",
            },
            error_category: {
              type: "string",
              description:
                "If failed: category like 'compilation_error', 'test_failure', 'context_limit'.",
            },
            tests_passed: {
              type: "boolean",
              description: "Whether the changes pass tests.",
            },
          },
          required: ["outcome"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Count every tool call as a turn signal for calibration
    if (activeTracker) {
      activeTracker.recordTurn();
    }

    try {
      switch (name) {
        case "headsdown_status":
          return await handleStatus();
        case "headsdown_propose":
          return await handlePropose((args ?? {}) as Record<string, unknown>);
        case "headsdown_auth":
          return await handleAuth();
        case "headsdown_digest":
          return await handleDigest((args ?? {}) as Record<string, unknown>);
        case "headsdown_report":
          return await handleReport((args ?? {}) as Record<string, unknown>);
        case "headsdown_grants":
          return await handleGrants((args ?? {}) as Record<string, unknown>);
        case "headsdown_override":
          return await handleOverride((args ?? {}) as Record<string, unknown>);
        default:
          return errorResult(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return handleError(error);
    }
  });

  return server;
}

// === Tool Handlers ===

async function handleStatus() {
  const client = await getClient();
  if (!client) {
    return errorResult(
      "Not authenticated with HeadsDown. Run the headsdown_auth tool to connect your account.",
    );
  }

  const actorClient = withActorContext(client, "headsdown_status");
  const { contract, schedule: availability } = await actorClient.getAvailability();

  return textResult(
    JSON.stringify(
      {
        authenticated: true,
        contract,
        availability,
        summary: formatAvailabilitySummary(contract, availability),
      },
      null,
      2,
    ),
  );
}

async function handlePropose(args: Record<string, unknown>) {
  const description = args.description;
  if (!description || typeof description !== "string" || !description.trim()) {
    return errorResult("The 'description' parameter is required and must be a non-empty string.");
  }

  const client = await getClient();
  if (!client) {
    return errorResult("Not authenticated with HeadsDown. Run the headsdown_auth tool first.");
  }

  const input: ProposalInput = {
    agentRef: "claude-code",
    framework: "claude-code",
    description: description.trim(),
    estimatedFiles: typeof args.estimated_files === "number" ? args.estimated_files : undefined,
    estimatedMinutes:
      typeof args.estimated_minutes === "number" ? args.estimated_minutes : undefined,
    scopeSummary: typeof args.scope_summary === "string" ? args.scope_summary : undefined,
    sourceRef: typeof args.source_ref === "string" ? args.source_ref : undefined,
  };

  const actorClient = withActorContext(client, "headsdown_propose");
  const verdict = await actorClient.submitProposal(input);

  // Record approved proposals so the PreToolUse hook can check state
  if (verdict.decision === "approved") {
    await proposalState.recordApproval({
      id: verdict.proposalId,
      decision: "approved",
      description: input.description,
      evaluatedAt: verdict.evaluatedAt,
    });

    // Start calibration tracking for approved proposals
    try {
      const config = new ConfigStore();
      const configData = await config.load();
      if (configData.calibration !== false) {
        // Dispose any existing tracker from a previous proposal
        if (activeTracker) {
          activeTracker.dispose();
          activeTracker = null;
        }
        const tracker = new CalibrationTracker(actorClient, verdict.proposalId, {
          enabled: true,
        });
        tracker.start();
        activeTracker = tracker;
      }
    } catch (error) {
      // Don't fail the proposal if calibration setup fails
      console.error("Calibration setup failed:", error);
    }
  }

  const guidance =
    verdict.decision === "approved"
      ? "The task was approved. Proceed with the work as described."
      : "The task was deferred. Inform the user and suggest postponing or reducing " +
        "scope based on the reason provided.";

  return textResult(
    JSON.stringify(
      {
        decision: verdict.decision,
        reason: verdict.reason,
        guidance,
        proposalId: verdict.proposalId,
        evaluatedAt: verdict.evaluatedAt,
      },
      null,
      2,
    ),
  );
}

async function handleAuth(): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  // Check if already authenticated with a valid key
  const existingClient = await getClient();
  if (existingClient) {
    try {
      const actorClient = withActorContext(existingClient, "headsdown_auth");
      const profile = await actorClient.getProfile();
      return textResult(
        `Already authenticated with HeadsDown as ${profile.name ?? profile.email}. ` +
          "Your API key is valid. No action needed.",
      );
    } catch {
      // Key is invalid, proceed with re-auth below
    }
  }

  let authDetails: DeviceAuthorization | undefined;

  const client = await HeadsDownClient.authenticate(
    (auth) => {
      authDetails = auth;
    },
    { label: "Claude Code Extension" },
  );

  // Verify the new key works
  const profile = await client.getProfile();

  const lines = [
    "Authentication successful!",
    "",
    `Connected as: ${profile.name ?? profile.email}`,
    `Credentials saved to: ~/.config/headsdown/credentials.json`,
    "",
    "HeadsDown is now active. Use headsdown_status to check availability",
    "and headsdown_propose before starting tasks.",
  ];

  if (authDetails) {
    lines.unshift(
      `Device Flow completed for code: ${authDetails.userCode}`,
      `Verification URL: ${authDetails.verificationUriComplete}`,
      "",
    );
  }

  return textResult(lines.join("\n"));
}

async function handleDigest(args: Record<string, unknown>) {
  const client = await getClient();
  if (!client) {
    return errorResult("Not authenticated with HeadsDown. Run the headsdown_auth tool first.");
  }

  const latest = typeof args.latest === "number" ? args.latest : 20;
  const actorClient = withActorContext(client, "headsdown_digest");
  const summaries = await actorClient.listDigestSummaries({ latest });

  if (summaries.length === 0) {
    return textResult(
      JSON.stringify(
        {
          summaries: [],
          message: "No digest entries. Nothing arrived while you were in focus mode.",
        },
        null,
        2,
      ),
    );
  }

  const formatted = summaries.map((s: DigestSummary) => ({
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
      at: e.insertedAt,
    })),
  }));

  return textResult(
    JSON.stringify(
      {
        summaries: formatted,
        total: summaries.length,
        message: `${summaries.length} digest ${summaries.length === 1 ? "summary" : "summaries"} from your last focus session.`,
      },
      null,
      2,
    ),
  );
}

async function handleReport(args: Record<string, unknown>) {
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
      "No active calibration session. Submit a proposal via headsdown_propose first.",
    );
  }

  try {
    const extras: Record<string, unknown> = {};
    if (typeof args.error_category === "string") extras.errorCategory = args.error_category;
    if (typeof args.tests_passed === "boolean") extras.testsPassed = args.tests_passed;

    await tracker.complete(
      outcome as "completed" | "failed" | "partially_completed" | "cancelled" | "timed_out",
      extras,
    );

    return textResult(
      JSON.stringify(
        {
          reported: true,
          outcome,
          message: "Outcome recorded. This helps HeadsDown calibrate future verdicts.",
        },
        null,
        2,
      ),
    );
  } catch (error) {
    return handleError(error);
  } finally {
    activeTracker = null;
  }
}

async function handleGrants(args: Record<string, unknown>) {
  const client = await getClient();
  if (!client) {
    return errorResult("Not authenticated with HeadsDown. Run the headsdown_auth tool first.");
  }

  const actorClient = withActorContext(client, "headsdown_grants");
  const action = typeof args.action === "string" ? args.action : "list_active";

  if (action === "list_active") {
    const grants = await actorClient.listActiveDelegationGrants();
    return textResult(JSON.stringify({ grants }, null, 2));
  }

  if (action === "list") {
    const filter = buildDelegationGrantFilterInput(args);
    const hasFilter = Object.values(filter).some((value) => value !== undefined);
    const grants = await actorClient.listDelegationGrants(hasFilter ? filter : undefined);
    return textResult(JSON.stringify({ grants }, null, 2));
  }

  if (action === "create") {
    if (typeof args.scope !== "string") {
      return errorResult("The 'scope' parameter is required for action='create'.");
    }

    if (!Array.isArray(args.permissions) || args.permissions.length === 0) {
      return errorResult("The 'permissions' parameter is required for action='create'.");
    }

    const input: DelegationGrantInput = {
      scope: args.scope as DelegationGrantScope,
      sessionId: typeof args.session_id === "string" ? args.session_id : undefined,
      workspaceRef: typeof args.workspace_ref === "string" ? args.workspace_ref : undefined,
      agentId: typeof args.agent_id === "string" ? args.agent_id : undefined,
      permissions: args.permissions as DelegationGrantPermission[],
      durationMinutes:
        typeof args.duration_minutes === "number" ? args.duration_minutes : undefined,
      expiresAt: typeof args.expires_at === "string" ? args.expires_at : undefined,
      source: typeof args.source === "string" ? args.source : "claude-code",
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
    const hasFilter = Object.values(filter).some((value) => value !== undefined);
    const result = await actorClient.revokeDelegationGrants(hasFilter ? filter : undefined);
    return textResult(JSON.stringify({ result }, null, 2));
  }

  return errorResult(
    "Invalid action. Must be one of: list_active, list, create, revoke, revoke_many.",
  );
}

async function handleOverride(args: Record<string, unknown>) {
  const client = await getClient();
  if (!client) {
    return errorResult("Not authenticated with HeadsDown. Run the headsdown_auth tool first.");
  }

  const actorClient = withActorContext(client, "headsdown_override");
  const action = typeof args.action === "string" ? args.action : "get";

  if (action === "get") {
    const override = await getActiveAvailabilityOverrideCompat(actorClient);
    return textResult(JSON.stringify({ override }, null, 2));
  }

  if (action === "set") {
    if (typeof args.mode !== "string") {
      return errorResult("The 'mode' parameter is required for action='set'.");
    }

    const override = await createAvailabilityOverrideCompat(actorClient, {
      mode: args.mode as AvailabilityOverride["mode"],
      durationMinutes:
        typeof args.duration_minutes === "number" ? args.duration_minutes : undefined,
      expiresAt: typeof args.expires_at === "string" ? args.expires_at : undefined,
      reason: typeof args.reason === "string" ? args.reason : undefined,
      source: "claude-code",
    });

    return textResult(JSON.stringify({ override }, null, 2));
  }

  if (action === "clear") {
    const idArg = typeof args.id === "string" ? args.id : undefined;
    const activeOverride = idArg ? null : await getActiveAvailabilityOverrideCompat(actorClient);
    const targetId = idArg ?? activeOverride?.id;

    if (!targetId) {
      return textResult(
        JSON.stringify({ override: null, message: "No active override to clear." }, null, 2),
      );
    }

    const override = await cancelAvailabilityOverrideCompat(
      actorClient,
      targetId,
      typeof args.reason === "string" ? args.reason : undefined,
    );
    return textResult(JSON.stringify({ override }, null, 2));
  }

  return errorResult("Invalid action. Must be one of: get, set, clear.");
}

// === Helpers ===

function withActorContext(client: HeadsDownClient, toolName: string): HeadsDownClient {
  const actorContext: ActorContext = {
    source: "claude-code",
    agentId: "claude-code",
    sessionId: process.env.CLAUDE_SESSION_ID,
    workspaceRef: process.cwd(),
  };

  if (toolName) {
    actorContext.agentId = `claude-code:${toolName}`;
  }

  return client.withActor(actorContext);
}

function buildDelegationGrantFilterInput(
  args: Record<string, unknown>,
): DelegationGrantFilterInput {
  return {
    active: typeof args.active === "boolean" ? args.active : undefined,
    scope: typeof args.scope === "string" ? (args.scope as DelegationGrantScope) : undefined,
    sessionId: typeof args.session_id === "string" ? args.session_id : undefined,
    workspaceRef: typeof args.workspace_ref === "string" ? args.workspace_ref : undefined,
    agentId: typeof args.agent_id === "string" ? args.agent_id : undefined,
    source: typeof args.source === "string" ? args.source : undefined,
  };
}

function getLowLevelGraphQLClient(client: HeadsDownClient): {
  request: (query: string, variables?: Record<string, unknown>) => Promise<Record<string, unknown>>;
} | null {
  const maybeGraphQL = (client as unknown as { graphql?: unknown }).graphql;
  if (!maybeGraphQL || typeof maybeGraphQL !== "object") return null;

  const request = (maybeGraphQL as { request?: unknown }).request;
  if (typeof request !== "function") return null;

  return {
    request: request.bind(maybeGraphQL) as (
      query: string,
      variables?: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>,
  };
}

type AvailabilityOverrideInput = {
  mode: AvailabilityOverride["mode"];
  durationMinutes?: number;
  expiresAt?: string;
  reason?: string;
  source?: string;
};

async function createAvailabilityOverrideCompat(
  client: HeadsDownClient,
  input: AvailabilityOverrideInput,
): Promise<AvailabilityOverride> {
  const nativeMethod = (
    client as unknown as {
      createAvailabilityOverride?: (
        value: AvailabilityOverrideInput,
      ) => Promise<AvailabilityOverride>;
    }
  ).createAvailabilityOverride;

  if (typeof nativeMethod === "function") {
    return nativeMethod(input);
  }

  const graphql = getLowLevelGraphQLClient(client);
  if (!graphql) {
    throw new Error("Availability override APIs are unavailable in this @headsdown/sdk version.");
  }

  const data = await graphql.request(CREATE_AVAILABILITY_OVERRIDE_MUTATION, { input });
  const override =
    (data.createAvailabilityOverride as AvailabilityOverride | null | undefined) ?? null;
  if (!override) {
    throw new Error("HeadsDown API returned no availability override data.");
  }

  return override;
}

async function getActiveAvailabilityOverrideCompat(
  client: HeadsDownClient,
): Promise<AvailabilityOverride | null> {
  const nativeMethod = (
    client as unknown as {
      getActiveAvailabilityOverride?: () => Promise<AvailabilityOverride | null>;
    }
  ).getActiveAvailabilityOverride;

  if (typeof nativeMethod === "function") {
    return nativeMethod();
  }

  const graphql = getLowLevelGraphQLClient(client);
  if (!graphql) {
    throw new Error("Availability override APIs are unavailable in this @headsdown/sdk version.");
  }

  const data = await graphql.request(ACTIVE_AVAILABILITY_OVERRIDE_QUERY);
  return (data.activeAvailabilityOverride as AvailabilityOverride | null | undefined) ?? null;
}

async function cancelAvailabilityOverrideCompat(
  client: HeadsDownClient,
  id: string,
  reason?: string,
): Promise<AvailabilityOverride> {
  const nativeMethod = (
    client as unknown as {
      cancelAvailabilityOverride?: (
        value: string,
        reason?: string,
      ) => Promise<AvailabilityOverride>;
    }
  ).cancelAvailabilityOverride;

  if (typeof nativeMethod === "function") {
    return nativeMethod(id, reason);
  }

  const graphql = getLowLevelGraphQLClient(client);
  if (!graphql) {
    throw new Error("Availability override APIs are unavailable in this @headsdown/sdk version.");
  }

  const data = await graphql.request(CANCEL_AVAILABILITY_OVERRIDE_MUTATION, {
    id,
    reason,
    source: "claude-code",
  });
  const override =
    (data.cancelAvailabilityOverride as AvailabilityOverride | null | undefined) ?? null;
  if (!override) {
    throw new Error("HeadsDown API returned no cancelled override data.");
  }

  return override;
}

function getCredentialsPathOverride(): string | undefined {
  const value = process.env.HEADSDOWN_CREDENTIALS_PATH;
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function getClient(): Promise<HeadsDownClient | null> {
  try {
    const credentialsPath = getCredentialsPathOverride();
    return await HeadsDownClient.fromCredentials(credentialsPath ? { credentialsPath } : undefined);
  } catch {
    return null;
  }
}

function formatAvailabilitySummary(
  contract: Contract | null,
  availability: ScheduleResolution,
): string {
  const parts: string[] = [];

  if (!contract) {
    parts.push("No active availability contract. The user has not set their status.");
  } else {
    parts.push(`Mode: ${contract.mode}`);

    if (contract.statusText) {
      const emoji = contract.statusEmoji ? `${contract.statusEmoji} ` : "";
      parts.push(`Status: ${emoji}${contract.statusText}`);
    }

    if (contract.expiresAt) {
      const expires = new Date(contract.expiresAt);
      const now = new Date();
      const minutesLeft = Math.round((expires.getTime() - now.getTime()) / 60000);
      if (minutesLeft > 0) {
        parts.push(`Time remaining: ${minutesLeft} minutes`);
      }
    }

    if (contract.lock) parts.push("Status is locked (user does not want changes)");
    if (contract.autoRespond) parts.push("Auto-respond is enabled");
  }

  if (availability.inReachableHours) {
    parts.push("Currently in available hours.");
  } else {
    parts.push("Currently outside available hours.");
  }

  if (availability.activeWindow) {
    parts.push(
      `Active availability window: ${availability.activeWindow.label} (${availability.activeWindow.mode})`,
    );
  }

  if (availability.nextWindow) {
    parts.push(
      `Next availability window: ${availability.nextWindow.label} (${availability.nextWindow.mode})`,
    );
  }

  if (availability.nextTransitionAt) {
    parts.push(`Next availability transition at: ${availability.nextTransitionAt}`);
  }

  return parts.join("\n");
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function handleError(error: unknown) {
  if (error instanceof AuthError) {
    return errorResult(
      `Authentication error: ${error.message}\n\nRun the headsdown_auth tool to re-authenticate.`,
    );
  }
  if (error instanceof ValidationError) {
    return errorResult(`Invalid input: ${error.message}`);
  }
  if (error instanceof NetworkError) {
    return errorResult(
      `Could not reach HeadsDown: ${error.message}\n\nCheck your network connection and try again.`,
    );
  }
  if (error instanceof ApiError) {
    return errorResult(`HeadsDown API error: ${error.message}`);
  }
  const message = error instanceof Error ? error.message : String(error);
  return errorResult(`Unexpected error: ${message}`);
}
