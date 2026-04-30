import { writeFile, readFile, unlink, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as HeadsDownSDK from "@headsdown/sdk";
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
import { getAgentControlOverviewCompat, renderHeadsDownCall } from "./agent-control.js";
import { reportRunOutcome, reportRunResumed, reportRunStarted } from "./agent-run-events.js";
import { getActiveRunStateForSession } from "./agent-run-state.js";
import {
  applyCanonicalAction,
  APPLY_HEADSDOWN_ACTION_MUTATION,
  LocalActionMarkerStore,
} from "./headsdown-action-executor.js";
import { getLowLevelGraphQLClient } from "./sdk-compat.js";
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
  ExecutionDirective,
  InterruptResult,
  ProposalInput,
  ScheduleResolution,
  Verdict,
} from "@headsdown/sdk";

const proposalState = new ProposalStateStore();
function createActionMarkerStore(): LocalActionMarkerStore {
  return new LocalActionMarkerStore();
}
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
            delivery_mode: {
              type: "string",
              enum: ["auto", "wrap_up", "full_depth"],
              description: "Optional task delivery mode override for Wrap-Up guidance.",
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
          "View or dismiss the user's HeadsDown digest: aggregated notifications and messages " +
          "that arrived while they were in focus mode. Returns summaries grouped by source " +
          "(e.g., Slack messages from a teammate, GitHub PR comments). Call at the start of a " +
          "session or when the user asks what they missed. After presenting entries, offer to " +
          "dismiss them. Use action 'dismiss' with an id to clear a specific entry.",
        inputSchema: {
          type: "object" as const,
          properties: {
            action: {
              type: "string",
              enum: ["list", "dismiss"],
              description:
                "list (default) to view summaries; dismiss to clear a specific entry by id.",
            },
            latest: {
              type: "number",
              description: "Limit to N most recent digest summaries (for list). Defaults to 20.",
            },
            id: {
              type: "string",
              description: "Digest summary id to dismiss (required for dismiss action).",
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
      {
        name: "headsdown_continuation",
        description:
          "HeadsDown: Save or load a structured continuation artifact for resumable work sessions. " +
          "When wrapping up a session, call with action 'save' to persist your progress " +
          "so the next session can resume where you left off. The next SessionStart hook " +
          "will detect the continuation and inject it into context.",
        inputSchema: {
          type: "object" as const,
          properties: {
            action: {
              type: "string",
              enum: ["save", "load"],
              description: "Save continuation data or load (and consume) a previous continuation.",
            },
            branch: {
              type: "string",
              description: "Current git branch name (for save).",
            },
            completed_steps: {
              type: "array",
              items: { type: "string" },
              description: "Steps that were completed in this session (for save).",
            },
            pending_steps: {
              type: "array",
              items: { type: "string" },
              description: "Steps remaining to be done (for save).",
            },
            dirty_files: {
              type: "array",
              items: { type: "string" },
              description: "Files with uncommitted changes (for save).",
            },
            open_decisions: {
              type: "array",
              items: { type: "string" },
              description: "Decisions or questions that need the user's input (for save).",
            },
            resume_instruction: {
              type: "string",
              description:
                "A concise instruction for the next session on what to do first (for save).",
            },
          },
          required: ["action"],
        },
      },
      {
        name: "headsdown_interrupt",
        description:
          "HeadsDown: Check whether it is appropriate to interrupt the user with a question " +
          "or notification. Call this before asking a non-critical clarifying question mid-task. " +
          "If allowed is false, use the autoResponse text instead of interrupting. " +
          "Returns { allowed, reason, autoResponse, guidance }.",
        inputSchema: {
          type: "object" as const,
          properties: {
            handle: {
              type: "string",
              description:
                "Type of interrupt: 'clarifying_question', 'scope_change', 'error', " +
                "'status_update'. Defaults to 'claude-code' if omitted.",
            },
          },
          required: [],
        },
      },
      {
        name: "headsdown_apply_action",
        description:
          "Apply a canonical HeadsDown action key for a specific run. This uses backend action semantics, " +
          "validates against current allowedActionKeys when available, and returns structured errors for " +
          "unsupported, not-allowed, and missing-input cases.",
        inputSchema: {
          type: "object" as const,
          properties: {
            run_id: { type: "string", description: "Target run id." },
            action_key: {
              type: "string",
              description: "Canonical action key, for example queue_for_morning.",
            },
            duration_minutes: {
              type: "number",
              description:
                "Required for allow_for_duration. Optional for backend actions that include limits.",
            },
            reason: {
              type: "string",
              description:
                "Optional privacy-safe action reason. Do not include prompts, code, file paths, repo names, branch names, logs, terminal output, or message contents.",
            },
            idempotency_key: {
              type: "string",
              description:
                "Optional idempotency key. If omitted, Claude generates a retry-stable key.",
            },
            resume_eligible_at: {
              type: "string",
              description: "Optional ISO datetime for queue/resume metadata.",
            },
            next_work_window_starts_at: {
              type: "string",
              description: "Optional ISO datetime for queue metadata.",
            },
            handoff_available: {
              type: "boolean",
              description: "Optional queue/handoff availability flag.",
            },
            handoff_state: {
              type: "string",
              description: "Optional handoff state: saved, missing, unknown.",
            },
            handoff_source: {
              type: "string",
              description: "Optional handoff source label. Defaults to claude.",
            },
            handoff_kind: { type: "string", description: "Optional handoff kind label." },
            handoff_captured_at: {
              type: "string",
              description: "Optional ISO datetime when handoff was captured.",
            },
            handoff_summary: {
              type: "string",
              description:
                "Privacy-safe local handoff summary. Required when action_key is queue_for_morning or pause_and_summarize. Returned on resume_run.",
            },
          },
          required: ["run_id", "action_key"],
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
        case "headsdown_continuation":
          return await handleContinuation((args ?? {}) as Record<string, unknown>);
        case "headsdown_interrupt":
          return await handleInterrupt((args ?? {}) as Record<string, unknown>);
        case "headsdown_apply_action":
          return await handleApplyAction((args ?? {}) as Record<string, unknown>);
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
  const directive = resolveExecutionDirective({ contract, schedule: availability });
  const wrapUpInstruction =
    directive?.primaryDirective ??
    resolveExecutionInstruction({ contract, schedule: availability });
  const overview = await getAgentControlOverviewCompat(actorClient);
  const renderedHeadsDownCall = overview?.headsdownCall
    ? renderHeadsDownCall(overview.headsdownCall)
    : null;

  return textResult(
    JSON.stringify(
      {
        authenticated: true,
        // Axis 1: availability mode (user-set)
        mode: contract?.mode ?? null,
        // Axis 2: execution directive (schedule-derived)
        executionDirective: directive
          ? {
              code: directive.directiveCode,
              primary: directive.primaryDirective,
              summary: directive.summary,
              hardLimits: directive.hardLimits,
            }
          : null,
        // Full objects for callers that need them
        contract,
        availability,
        headsdownCall: overview?.headsdownCall ?? null,
        renderedHeadsDownCall,
        summary: formatAvailabilitySummary(contract, availability, renderedHeadsDownCall?.title),
        wrapUpInstruction,
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
    deliveryMode: parseDeliveryMode(args.delivery_mode),
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

    // Write companion meta file so hooks can access estimatedFiles for scope tracking
    try {
      const metaPath = proposalState.filePath.replace(/\.json$/, ".meta.json");
      await writeFile(
        metaPath,
        JSON.stringify({ estimatedFiles: input.estimatedFiles ?? null }, null, 2),
        { mode: 0o600 },
      );
    } catch {
      // Non-critical: hook will skip scope comparison if meta is unavailable
    }

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

    await reportRunStarted(actorClient, {
      proposalId: verdict.proposalId,
      estimatedFiles: input.estimatedFiles,
      estimatedMinutes: input.estimatedMinutes,
    });
  }

  const guidance =
    verdict.decision === "approved"
      ? "The task was approved. Proceed with the work as described."
      : "The task was deferred. Inform the user and suggest postponing or reducing " +
        "scope based on the reason provided.";
  const wrapUpInstruction = resolveExecutionInstruction({
    verdict: {
      decision: verdict.decision,
      reason: verdict.reason,
      wrapUpGuidance: verdict.wrapUpGuidance,
    },
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
        wrapUpInstruction,
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

    const terminalOutcome = outcome as
      | "completed"
      | "failed"
      | "partially_completed"
      | "cancelled"
      | "timed_out";
    await tracker.complete(terminalOutcome, extras);

    const activeRun = await getActiveRunStateForSession();
    const reportingClient = await getClient();
    if (activeRun && reportingClient) {
      const actorClient = withActorContext(reportingClient, "headsdown_report");
      await reportRunOutcome(actorClient, {
        proposalId: activeRun.proposalId,
        outcome: terminalOutcome,
        errorCategory: typeof args.error_category === "string" ? args.error_category : undefined,
        testsPassed: typeof args.tests_passed === "boolean" ? args.tests_passed : undefined,
      });
    }

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

  try {
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
  } catch (error) {
    const grantMessage = formatGrantCapabilityError(error);
    if (grantMessage) {
      return errorResult(grantMessage);
    }
    return handleError(error);
  }
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
    workspaceRef: "unknown",
  };

  if (toolName) {
    actorContext.agentId = `claude-code:${toolName}`;
  }

  return client.withActor(actorContext);
}

function parseDeliveryMode(value: unknown): ProposalInput["deliveryMode"] {
  if (value === "auto" || value === "wrap_up" || value === "full_depth") {
    return value;
  }

  return undefined;
}

function resolveExecutionDirective(input: {
  contract?: Contract | null;
  schedule?: ScheduleResolution | null;
  verdict?: Pick<Verdict, "decision" | "reason" | "wrapUpGuidance"> | null;
}): ExecutionDirective | null {
  const fn = (
    HeadsDownSDK as unknown as {
      describeExecutionDirective?: (value: typeof input) => ExecutionDirective;
    }
  ).describeExecutionDirective;
  return typeof fn === "function" ? fn(input) : null;
}

function resolveExecutionInstruction(input: {
  contract?: Contract | null;
  schedule?: ScheduleResolution | null;
  verdict?: Pick<Verdict, "decision" | "reason" | "wrapUpGuidance"> | null;
}): string | null {
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
    instruction =
      "Execution policy for this task: keep scope minimal, avoid starting new refactors, finish the current slice cleanly, and include clear handoff notes for deferred work.";
  } else if (guidance.selectedMode === "full_depth") {
    instruction =
      "Execution policy for this task: proceed with full implementation depth, include robust validation and tests, and do not shrink scope only because a deadline is near.";
  } else {
    instruction =
      "Execution policy for this task: follow the provided context to balance scope and depth, stay focused on the requested outcome, and avoid unnecessary expansion.";
  }

  const context: string[] = [];

  if (typeof guidance.remainingMinutes === "number") {
    context.push(
      `About ${guidance.remainingMinutes} minutes remain before the attention deadline.`,
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

function isSessionTokenOnlyGrantError(message: string): boolean {
  return (
    message.includes("session-token auth path") ||
    message.includes("session-token auth") ||
    message.includes("Delegation grants require session-token auth")
  );
}

function continuationPath(): string {
  const override = process.env.HEADSDOWN_CONTINUATION_PATH?.trim();
  if (override) return override;
  return join(homedir(), ".config", "headsdown", "continuation.json");
}

async function handleContinuation(args: Record<string, unknown>) {
  const action = typeof args.action === "string" ? args.action : "";

  if (action === "save") {
    const data = {
      branch: typeof args.branch === "string" ? args.branch : null,
      completedSteps: Array.isArray(args.completed_steps) ? args.completed_steps : [],
      pendingSteps: Array.isArray(args.pending_steps) ? args.pending_steps : [],
      dirtyFiles: Array.isArray(args.dirty_files) ? args.dirty_files : [],
      openDecisions: Array.isArray(args.open_decisions) ? args.open_decisions : [],
      resumeInstruction:
        typeof args.resume_instruction === "string" ? args.resume_instruction : null,
      savedAt: new Date().toISOString(),
    };

    await writeContinuationArtifact(data);

    return textResult(JSON.stringify({ saved: true, path: continuationPath(), data }, null, 2));
  }

  if (action === "load") {
    const data = await loadContinuationArtifact({ consume: true });
    if (!data) {
      return textResult(
        JSON.stringify({ found: false, message: "No continuation artifact found." }, null, 2),
      );
    }

    return textResult(JSON.stringify({ found: true, data }, null, 2));
  }

  return errorResult("The 'action' parameter must be 'save' or 'load'.");
}

async function handleInterrupt(args: Record<string, unknown>) {
  const client = await getClient();
  if (!client) {
    return errorResult(
      "Not authenticated with HeadsDown. Run the headsdown_auth tool to connect your account.",
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
          guidance:
            "Claude Code controls the model. HeadsDown controls the run. This run stays queued until resume_run succeeds or the user explicitly allows continuation.",
          runId: offClockMarker.runId,
        },
        null,
        2,
      ),
    );
  }

  const handle =
    typeof args.handle === "string" && args.handle.trim() ? args.handle.trim() : "claude-code";

  const actorClient = withActorContext(client, "headsdown_interrupt");
  const result: InterruptResult = await actorClient.evaluateInterrupt(handle);

  const guidance = result.allowed
    ? "You may proceed with the interrupt."
    : result.autoResponse
      ? `Do not interrupt. Respond with: "${result.autoResponse}"`
      : "Do not interrupt. Continue working without asking.";

  return textResult(
    JSON.stringify(
      {
        allowed: result.allowed,
        reason: result.reason,
        autoResponse: result.autoResponse,
        guidance,
      },
      null,
      2,
    ),
  );
}

async function handleApplyAction(args: Record<string, unknown>) {
  const client = await getClient();
  if (!client) {
    return errorResult("Not authenticated with HeadsDown. Run the headsdown_auth tool first.");
  }

  const actorClient = withActorContext(client, "headsdown_apply_action");
  const now = new Date();
  const actionKey = typeof args.action_key === "string" ? args.action_key : "";
  const normalizedActionKey = normalizeStateToken(actionKey);
  const queueForMorning = normalizedActionKey === "queue_for_morning";
  const pauseAndSummarize = normalizedActionKey === "pause_and_summarize";
  const resumeRun = normalizedActionKey === "resume_run";
  const savesHandoff = queueForMorning || pauseAndSummarize;
  const handoffSummary = cleanOptionalText(
    typeof args.handoff_summary === "string" ? args.handoff_summary : null,
  );

  if (savesHandoff && !handoffSummary) {
    return errorResult(
      JSON.stringify(
        {
          ok: false,
          error: {
            code: "missing_required_input",
            message: `handoff_summary is required before ${normalizedActionKey} can report a saved handoff.`,
            details: { field: "handoff_summary", actionKey: normalizedActionKey },
          },
        },
        null,
        2,
      ),
    );
  }

  if (savesHandoff) {
    await writeContinuationArtifact({
      branch: null,
      completedSteps: [],
      pendingSteps: [handoffSummary],
      dirtyFiles: [],
      openDecisions: [
        pauseAndSummarize ? "Re-scope before continuing." : "Resume when back on the clock.",
      ],
      resumeInstruction: handoffSummary,
      runId: cleanOptionalText(typeof args.run_id === "string" ? args.run_id : null),
      savedAt: now.toISOString(),
    });
  }

  const result = await applyCanonicalAction(
    {
      runId: typeof args.run_id === "string" ? args.run_id : "",
      actionKey,
      durationMinutes:
        typeof args.duration_minutes === "number" ? args.duration_minutes : undefined,
      reason: typeof args.reason === "string" ? args.reason : undefined,
      idempotencyKey: typeof args.idempotency_key === "string" ? args.idempotency_key : undefined,
      resumeEligibleAt:
        typeof args.resume_eligible_at === "string" ? args.resume_eligible_at : undefined,
      nextWorkWindowStartsAt:
        typeof args.next_work_window_starts_at === "string"
          ? args.next_work_window_starts_at
          : undefined,
      handoffAvailable:
        typeof args.handoff_available === "boolean"
          ? args.handoff_available
          : savesHandoff
            ? true
            : undefined,
      handoffState:
        typeof args.handoff_state === "string"
          ? (args.handoff_state as "saved" | "missing" | "unknown")
          : savesHandoff
            ? "saved"
            : undefined,
      handoffSource:
        typeof args.handoff_source === "string"
          ? args.handoff_source
          : savesHandoff
            ? "claude"
            : undefined,
      handoffKind:
        typeof args.handoff_kind === "string"
          ? args.handoff_kind
          : pauseAndSummarize
            ? "pause_summary"
            : queueForMorning
              ? "queue_for_morning"
              : undefined,
      handoffCapturedAt:
        typeof args.handoff_captured_at === "string"
          ? args.handoff_captured_at
          : savesHandoff
            ? now.toISOString()
            : undefined,
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
          allowedActionKeys: runSummary.allowedActionKeys ?? [],
        };
      },
      mutateAction: async (input) => {
        const graphql = getLowLevelGraphQLClient(actorClient);
        if (!graphql) {
          throw new Error("HeadsDown action APIs are unavailable in this @headsdown/sdk version.");
        }
        return graphql.request(APPLY_HEADSDOWN_ACTION_MUTATION, { input });
      },
    },
  );

  if (!result.ok) {
    if (savesHandoff) {
      await loadContinuationArtifact({ consume: true });
    }

    return errorResult(JSON.stringify(result, null, 2));
  }

  const payload: Record<string, unknown> = {
    ok: true,
    mutationInput: result.mutationInput,
    action: result.payload,
  };

  if (queueForMorning) {
    payload.offClock = {
      queuedForMorning: true,
      handoffSaved: true,
      handoffSummary,
      message: "Off the clock. Save the handoff and ask tomorrow.",
    };
  }

  if (pauseAndSummarize) {
    payload.handoff = {
      paused: true,
      handoffSaved: true,
      handoffSummary,
      message: "Run paused. Handoff saved for resume.",
    };
  }

  if (resumeRun) {
    const handoff = await loadContinuationArtifact({ consume: true });
    payload.offClock = {
      resumed: true,
      handoff,
      message:
        "Ready to resume. HeadsDown saved the thread so Claude can pick up without starting over.",
    };
    await reportRunResumed(actorClient, { runId: String(args.run_id) });
  }

  return textResult(JSON.stringify(payload, null, 2));
}

async function writeContinuationArtifact(data: Record<string, unknown>): Promise<void> {
  const path = continuationPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 });
}

async function loadContinuationArtifact(options: { consume: boolean }): Promise<unknown | null> {
  try {
    await access(continuationPath());
  } catch {
    return null;
  }

  const raw = await readFile(continuationPath(), "utf-8");
  const parsed = JSON.parse(raw);

  if (options.consume) {
    await unlink(continuationPath());
  }

  return parsed;
}

async function getActiveOffClockQueueMarker(): Promise<{ runId: string } | null> {
  const markers = await createActionMarkerStore().listActive();
  const offClockMarker = markers.find(
    (marker) =>
      marker.handoffKind === "queue_for_morning" || marker.attemptByAction?.queue_for_morning,
  );

  if (!offClockMarker) {
    return null;
  }

  return { runId: offClockMarker.runId };
}

function normalizeStateToken(value: string | null | undefined): string | null {
  const cleaned = cleanOptionalText(value);
  if (!cleaned) return null;
  return cleaned.toLowerCase().replace(/-/g, "_");
}

function cleanOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatGrantCapabilityError(error: unknown): string | null {
  if (error instanceof AuthError && isSessionTokenOnlyGrantError(error.message)) {
    return "Delegation grant management requires a session-token auth path and is unavailable for API-key clients.";
  }

  if (error instanceof ApiError && isSessionTokenOnlyGrantError(error.message)) {
    return "Delegation grant management requires a session-token auth path and is unavailable for API-key clients.";
  }

  return null;
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
  callSummary?: string,
): string {
  const parts: string[] = [];

  if (callSummary) {
    parts.push(`HeadsDown call: ${callSummary}`);
  }

  // Axis 1: availability mode (user-set)
  if (!contract) {
    parts.push("Axis 1 — Availability mode: not set (no active contract).");
  } else {
    parts.push(`Axis 1 — Availability mode (user-set): ${contract.mode}`);

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

  // Axis 2: execution directive (schedule-derived, independent of mode)
  const directive = resolveExecutionDirective({ contract, schedule: availability });
  if (directive) {
    parts.push(`Axis 2 — Execution directive (schedule-derived): ${directive.directiveCode}`);
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
      `Active availability window: ${availability.activeWindow.label} (${availability.activeWindow.mode})`,
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
    if (isSessionTokenOnlyGrantError(error.message)) {
      return errorResult(
        "Delegation grant management requires a session-token auth path and is unavailable for API-key clients.",
      );
    }

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
