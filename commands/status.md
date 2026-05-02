---
description: Show your current HeadsDown availability, mode, and execution policy
allowed-tools: Bash(node:*), Read
---

# HeadsDown Status

## Context

Current HeadsDown availability: !`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js summary 2>/dev/null || echo "Not authenticated. Run /headsdown:auth to connect."`

## Instructions

Display the availability context above in a clear, concise format. Show mode, status, remaining time, the active or next window, and the execution policy.

If the context line says the user is not authenticated, suggest `/headsdown:auth`.
