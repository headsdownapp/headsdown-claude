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
} from "@headsdown/sdk";
import type { Contract, Calendar, ProposalInput, DeviceAuthorization } from "@headsdown/sdk";

const proposalState = new ProposalStateStore();

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
          "(online/busy/limited/offline), status message, time remaining, and work schedule. " +
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
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "headsdown_status":
          return await handleStatus();
        case "headsdown_propose":
          return await handlePropose((args ?? {}) as Record<string, unknown>);
        case "headsdown_auth":
          return await handleAuth();
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

  const { contract, calendar } = await client.getAvailability();

  return textResult(
    JSON.stringify(
      {
        authenticated: true,
        contract,
        calendar,
        summary: formatAvailabilitySummary(contract, calendar),
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

  const verdict = await client.submitProposal(input);

  // Record approved proposals so the PreToolUse hook can check state
  if (verdict.decision === "approved") {
    await proposalState.recordApproval({
      id: verdict.proposalId,
      decision: "approved",
      description: input.description,
      evaluatedAt: verdict.evaluatedAt,
    });
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
      const profile = await existingClient.getProfile();
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

// === Helpers ===

async function getClient(): Promise<HeadsDownClient | null> {
  try {
    return await HeadsDownClient.fromCredentials();
  } catch {
    return null;
  }
}

function formatAvailabilitySummary(contract: Contract | null, calendar: Calendar): string {
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

    if (contract.afk) parts.push("User is AFK (away from keyboard)");
    if (contract.lock) parts.push("Status is locked (user does not want changes)");
    if (contract.autoRespond) parts.push("Auto-respond is enabled");
  }

  if (calendar.offHours) {
    parts.push(`Currently off-hours. Next workday: ${calendar.nextWorkday}`);
  } else if (calendar.workHours) {
    parts.push(`Work hours active (${calendar.day}). Day ends at ${calendar.endsAt}`);
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
