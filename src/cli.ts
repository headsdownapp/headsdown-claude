#!/usr/bin/env node

/**
 * Lightweight CLI used by hooks and commands to query HeadsDown.
 * Not the primary interface (that's the MCP server). This exists because
 * hooks and commands run as shell scripts and can't call MCP tools directly.
 */

import { HeadsDownClient, ConfigStore, ProposalStateStore, AuthError } from "@headsdown/sdk";
import type { ActorContext, Contract, ScheduleResolution } from "@headsdown/sdk";

const command = process.argv[2];

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
    default:
      process.exit(1);
  }
}

/** Full availability status as JSON. */
async function status() {
  const client = await HeadsDownClient.fromCredentials();
  const actorClient = withActorContext(client, "cli-status");
  const { contract, schedule: availability } = await actorClient.getAvailability();

  console.log(
    JSON.stringify(
      {
        contract,
        availability,
        summary: formatSummary(contract, availability),
        wrapUpInstruction: buildWrapUpInstruction(availability.wrapUpGuidance),
      },
      null,
      2,
    ),
  );
}

/** One-line summary suitable for system messages and command output. */
async function summary() {
  const client = await HeadsDownClient.fromCredentials();
  const actorClient = withActorContext(client, "cli-summary");
  const { contract, schedule: availability } = await actorClient.getAvailability();
  console.log(formatSummary(contract, availability));
}

/** Output current config as JSON. */
async function config() {
  const store = new ConfigStore();
  const cfg = await store.load();
  console.log(JSON.stringify(cfg, null, 2));
}

/** Output proposal state. With --check, exit 0 if approved exists, 1 otherwise. */
async function proposals() {
  const store = new ProposalStateStore();
  const flag = process.argv[3];

  if (flag === "--check") {
    const hasApproved = await store.hasApprovedProposal();
    process.exit(hasApproved ? 0 : 1);
  }

  const latest = await store.getLatestApproved();
  if (latest) {
    console.log(JSON.stringify(latest, null, 2));
  } else {
    console.log(JSON.stringify(null));
  }
}

/** Output the count of pending digest summaries. Used by session-start hook. */
async function digestCount() {
  const client = await HeadsDownClient.fromCredentials();
  const actorClient = withActorContext(client, "cli-digest-count");
  const summaries = await actorClient.listDigestSummaries({ latest: 50 });
  console.log(String(summaries.length));
}

function buildWrapUpInstruction(
  guidance:
    | {
        active?: boolean;
        selectedMode?: "auto" | "wrap_up" | "full_depth";
        remainingMinutes?: number | null;
        reason?: string;
        hints?: string[];
      }
    | null
    | undefined,
): string | null {
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

function withActorContext(client: HeadsDownClient, commandName: string): HeadsDownClient {
  const actorContext: ActorContext = {
    source: "claude-code",
    agentId: `claude-code:${commandName}`,
    sessionId: process.env.CLAUDE_SESSION_ID,
    workspaceRef: process.cwd(),
  };

  return client.withActor(actorContext);
}

function formatSummary(contract: Contract | null, availability: ScheduleResolution): string {
  const parts: string[] = [];

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
      const now = new Date();
      const minutesLeft = Math.round((expires.getTime() - now.getTime()) / 60000);
      if (minutesLeft > 0) {
        parts.push(`${minutesLeft}min remaining`);
      }
    }

    if (contract.lock) parts.push("locked");
  }

  parts.push(availability.inReachableHours ? "available hours" : "outside available hours");

  if (availability.activeWindow) {
    parts.push(
      `active availability window: ${availability.activeWindow.label} (${availability.activeWindow.mode})`,
    );
  }

  const wrapUpInstruction = buildWrapUpInstruction(availability.wrapUpGuidance);
  if (wrapUpInstruction) {
    parts.push(`wrap-up instruction: ${wrapUpInstruction}`);
  }

  if (availability.nextWindow) {
    parts.push(
      `next availability window: ${availability.nextWindow.label} (${availability.nextWindow.mode})`,
    );
  }

  return parts.join(", ");
}

main().catch((error) => {
  if (error instanceof AuthError) {
    process.exit(1);
  }
  process.exit(1);
});
