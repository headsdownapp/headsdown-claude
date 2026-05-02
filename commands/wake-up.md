---
description: Review metadata-only deferred decisions captured during autopilot
allowed-tools: Bash(node:*), mcp__headsdown__headsdown_deferred
argument-hint: [list|decision_id]
---

# HeadsDown Wake-Up

## Context

Wake-up digest: !`node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js autopilot wake-up 2>/dev/null || true`

## Instructions

If the context includes a wake-up digest, summarize the derived facts only and call `headsdown_deferred` with action `list` so the user can review entries.

If the user provides a decision id, call `headsdown_deferred` with action `view` for that id, then ask whether they want to approve, override, refine, or dismiss it.

Never display raw transcript text, question text, file paths, terminal output, URLs, code snippets, prompts, or repository names. Only show metadata returned by the tool.

User provided: $ARGUMENTS
