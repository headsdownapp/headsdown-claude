---
description: Check your HeadsDown availability status, or authenticate if not connected
allowed-tools: Bash(node:*), Read
argument-hint: [status|auth]
---

# HeadsDown Status

## Context

Current HeadsDown availability: !`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js summary 2>/dev/null || echo "Not authenticated. Run /headsdown auth to connect."`

## Instructions

Based on the user's argument:

**No argument or "status":** Display the availability context above in a clear, concise format. Show mode, status, time remaining, and schedule. If not authenticated, suggest running `/headsdown auth`.

**"auth":** Run the HeadsDown authentication flow using the `headsdown_auth` MCP tool. Guide the user through the Device Flow: show them the URL and code, wait for approval.

User provided: $ARGUMENTS
