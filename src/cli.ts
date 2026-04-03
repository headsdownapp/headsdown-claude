#!/usr/bin/env node

/**
 * Lightweight CLI used by hooks and commands to query HeadsDown.
 * Not the primary interface (that's the MCP server). This exists because
 * hooks and commands run as shell scripts and can't call MCP tools directly.
 */

import { HeadsDownClient, ConfigStore, ProposalStateStore, AuthError } from "@headsdown/sdk";
import type { Contract, Calendar, HeadsDownConfig } from "@headsdown/sdk";

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
    default:
      process.exit(1);
  }
}

/** Full availability status as JSON. */
async function status() {
  const client = await HeadsDownClient.fromCredentials();
  const { contract, calendar } = await client.getAvailability();

  console.log(
    JSON.stringify(
      {
        contract,
        calendar,
        summary: formatSummary(contract, calendar),
      },
      null,
      2,
    ),
  );
}

/** One-line summary suitable for system messages and command output. */
async function summary() {
  const client = await HeadsDownClient.fromCredentials();
  const { contract, calendar } = await client.getAvailability();
  console.log(formatSummary(contract, calendar));
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

function formatSummary(contract: Contract | null, calendar: Calendar): string {
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

    if (contract.afk) parts.push("AFK");
    if (contract.lock) parts.push("locked");
  }

  if (calendar.offHours) {
    parts.push(`off-hours, next workday: ${calendar.nextWorkday}`);
  } else if (calendar.workHours) {
    parts.push(`work hours (${calendar.day})`);
  }

  return parts.join(", ");
}

main().catch((error) => {
  if (error instanceof AuthError) {
    process.exit(1);
  }
  process.exit(1);
});
