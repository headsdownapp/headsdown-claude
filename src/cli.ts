#!/usr/bin/env node

/**
 * Lightweight CLI used by hooks and commands to query HeadsDown.
 * Not the primary interface (that's the MCP server). This exists because
 * hooks and commands run as shell scripts and can't call MCP tools directly.
 */

import { HeadsDownClient, AuthError } from "@headsdown/sdk";
import type { Contract, Calendar } from "@headsdown/sdk";

const command = process.argv[2];

async function main() {
  switch (command) {
    case "status":
      return await status();
    case "summary":
      return await summary();
    default:
      process.exit(1);
  }
}

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
    // Silent exit for hooks; they should not disrupt the session
    process.exit(1);
  }
  process.exit(1);
});
