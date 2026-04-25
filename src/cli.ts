#!/usr/bin/env node

/**
 * Lightweight CLI used by hooks and commands to query HeadsDown.
 * Not the primary interface (that's the MCP server). This exists because
 * hooks and commands run as shell scripts and can't call MCP tools directly.
 */

import { readFile, writeFile, unlink, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import * as HeadsDownSDK from "@headsdown/sdk";
import { HeadsDownClient, ConfigStore, ProposalStateStore, AuthError } from "@headsdown/sdk";
import { getAgentControlOverviewCompat, renderHeadsDownCall } from "./agent-control.js";
import { LocalActionMarkerStore } from "./headsdown-action-executor.js";
import type {
  ActorContext,
  Contract,
  OutcomeInput,
  ScheduleResolution,
  Verdict,
} from "@headsdown/sdk";

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
    case "next-window":
      return await nextWindow();
    case "continuation":
      return await continuation();
    case "report":
      return await report();
    case "action-marker":
      return await actionMarker();
    default:
      process.exit(1);
  }
}

/** Full availability status as JSON. */
async function status() {
  const client = await HeadsDownClient.fromCredentials();
  const actorClient = withActorContext(client, "cli-status");
  const { contract, schedule: availability } = await actorClient.getAvailability();
  const overview = await getAgentControlOverviewCompat(actorClient);
  const renderedHeadsDownCall = overview?.headsdownCall
    ? renderHeadsDownCall(overview.headsdownCall)
    : null;

  console.log(
    JSON.stringify(
      {
        contract,
        availability,
        headsdownCall: overview?.headsdownCall ?? null,
        renderedHeadsDownCall,
        summary: formatSummary(contract, availability, renderedHeadsDownCall?.title),
        wrapUpInstruction: resolveExecutionInstruction({
          contract,
          schedule: availability,
        }),
        remainingMinutes: availability.wrapUpGuidance?.remainingMinutes ?? null,
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
  const overview = await getAgentControlOverviewCompat(actorClient);
  const renderedHeadsDownCall = overview?.headsdownCall
    ? renderHeadsDownCall(overview.headsdownCall)
    : null;
  console.log(formatSummary(contract, availability, renderedHeadsDownCall?.title));
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
    // Try to read companion meta file written by the MCP server, which preserves
    // estimatedFiles for use by the PostToolUse scope-tracking hook.
    const metaPath = store.filePath.replace(/\.json$/, ".meta.json");
    let meta: Record<string, unknown> = {};
    try {
      const metaRaw = await readFile(metaPath, "utf-8");
      meta = JSON.parse(metaRaw) as Record<string, unknown>;
    } catch {
      // No meta file — proposal was approved before this feature or meta was not written
    }
    console.log(JSON.stringify({ ...latest, ...meta }, null, 2));
  } else {
    console.log(JSON.stringify(null));
  }
}

/**
 * Output upcoming window transition info as JSON. Used by session-start hook.
 * Returns { nextWindowLabel, nextWindowMode, minutesUntil, wrapUpThresholdMinutes }
 * if the next transition is within 60 minutes, or null if no imminent transition.
 */
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
  const now = new Date();
  const minutesUntil = Math.round((transitionAt.getTime() - now.getTime()) / 60000);

  if (minutesUntil < 0 || minutesUntil > 60) {
    console.log(JSON.stringify(null));
    return;
  }

  console.log(
    JSON.stringify({
      nextWindowLabel: next?.label ?? null,
      nextWindowMode: next?.mode ?? null,
      minutesUntil,
      wrapUpThresholdMinutes: wrapUpGuidance.thresholdMinutes ?? null,
    }),
  );
}

/** Output the count of pending digest summaries. Used by session-start hook. */
async function digestCount() {
  const client = await HeadsDownClient.fromCredentials();
  const actorClient = withActorContext(client, "cli-digest-count");
  const summaries = await actorClient.listDigestSummaries({ latest: 50 });
  console.log(String(summaries.length));
}

const CONTINUATION_PATH = join(homedir(), ".config", "headsdown", "continuation.json");

/** Manage local action markers used to keep queued runs quiet until resume. */
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

/**
 * Manage continuation artifacts for resumable work sessions.
 * Subcommands: save (reads JSON from stdin), load (outputs and deletes), check (exits 0/1).
 */
async function continuation() {
  const subcommand = process.argv[3];

  switch (subcommand) {
    case "save": {
      // Read JSON from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      const data = Buffer.concat(chunks).toString("utf-8").trim();
      if (!data) {
        process.exit(1);
      }
      // Validate it's valid JSON
      JSON.parse(data);
      mkdirSync(dirname(CONTINUATION_PATH), { recursive: true });
      await writeFile(CONTINUATION_PATH, data, { mode: 0o600 });
      break;
    }
    case "load": {
      const raw = await readFile(CONTINUATION_PATH, "utf-8");
      console.log(raw);
      await unlink(CONTINUATION_PATH);
      break;
    }
    case "check": {
      try {
        await access(CONTINUATION_PATH);
      } catch {
        process.exit(1);
      }
      break;
    }
    default:
      process.exit(1);
  }
}

function resolveExecutionInstruction(input: {
  contract?: Contract | null;
  schedule?: ScheduleResolution | null;
  verdict?: Pick<Verdict, "decision" | "reason" | "wrapUpGuidance"> | null;
}): string | null {
  const describeExecutionDirective = (
    HeadsDownSDK as unknown as {
      describeExecutionDirective?: (value: {
        contract?: Contract | null;
        schedule?: ScheduleResolution | null;
        verdict?: Pick<Verdict, "decision" | "reason" | "wrapUpGuidance"> | null;
      }) => { primaryDirective?: string };
    }
  ).describeExecutionDirective;

  if (typeof describeExecutionDirective === "function") {
    const directive = describeExecutionDirective(input);
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

function withActorContext(client: HeadsDownClient, commandName: string): HeadsDownClient {
  const actorContext: ActorContext = {
    source: "claude-code",
    agentId: `claude-code:${commandName}`,
    sessionId: process.env.CLAUDE_SESSION_ID,
    workspaceRef: process.cwd(),
  };

  return client.withActor(actorContext);
}

function formatSummary(
  contract: Contract | null,
  availability: ScheduleResolution,
  callSummary?: string,
): string {
  const parts: string[] = [];

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

  const wrapUpInstruction = resolveExecutionInstruction({
    contract,
    schedule: availability,
  });
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

/**
 * Auto-report task outcome at session end.
 * Reads the latest approved proposal from ProposalStateStore and calls reportOutcome.
 * Outcome: partially_completed if a continuation artifact exists, completed otherwise.
 * Exits silently on any error — must never disrupt session end.
 */
async function report() {
  const store = new ProposalStateStore();
  const proposal = await store.getLatestApproved();
  if (!proposal) {
    process.exit(0);
  }

  let outcome: OutcomeInput["outcome"] = "completed";
  try {
    await access(CONTINUATION_PATH);
    outcome = "partially_completed";
  } catch {
    // No continuation file — task completed normally
  }

  try {
    const client = await HeadsDownClient.fromCredentials();
    const actorClient = withActorContext(client, "cli-report");
    const input: OutcomeInput = { proposalId: proposal.id, outcome };
    await actorClient.reportOutcome(input);
  } catch {
    // Don't disrupt session end for any reason
  }
}

main().catch((error) => {
  if (error instanceof AuthError) {
    process.exit(1);
  }
  process.exit(1);
});
