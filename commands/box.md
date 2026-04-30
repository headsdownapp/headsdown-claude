---
description: Declare, inspect, or clear an ad-hoc HeadsDown deadline for the current Claude Code session
allowed-tools: Bash(node:*)
argument-hint: "[duration like 30m, 45m, 1h, 1h30m | status | clear]"
---

# HeadsDown Box

A box is a session-scoped local deadline for the current Claude Code run. It tightens HeadsDown attention-window warnings earlier than the backend-derived deadline, but it never stops Claude automatically.

## Instructions

Read `$ARGUMENTS` and dispatch to the local CLI:

- If the argument is empty or `status`, run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js time-box status` and show whether a box is active, the current deadline, remaining minutes, and warning threshold.
- If the argument is `clear`, run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js time-box clear` and confirm backend-derived attention-window behavior is active again.
- Otherwise, treat the argument as a duration and run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js time-box set "$ARGUMENTS"`.

Example duration forms include `30m`, `45m`, `1h`, and `1h30m`.

If parsing fails, show the CLI error and tell the user to use one of the example forms.

A box is different from `/headsdown:extend` and `/headsdown:wrap`:

- `/headsdown:box` changes the local warning deadline for this Claude Code session.
- `/headsdown:extend` asks HeadsDown to extend an active window-closing run when the user explicitly wants more time.
- `/headsdown:wrap` is user-elected and saves a handoff. Never auto-trigger it because a box expired.

User provided: $ARGUMENTS
