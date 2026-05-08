---
description: Set a deadline for this session, like 30m, 1h, or 1h30m. Use `status` or `clear` to check or remove it.
allowed-tools: Bash(node:*)
argument-hint: "[30m | 1h | 1h30m | status | clear]"
---

# HeadsDown Time-Box

A time-box is a session-scoped local deadline for the current Claude Code run. When earlier than the backend-derived deadline, it tightens HeadsDown attention-window warnings, but it never stops Claude automatically.

## Instructions

Read `$ARGUMENTS` and dispatch to the local CLI:

- If the argument is empty or `status`, run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js time-box status` and show whether a time-box is active, the current deadline, remaining minutes, and warning threshold.
- If the argument is `clear`, run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js time-box clear` and confirm future warnings will use backend-derived attention-window behavior when available.
- Otherwise, treat the argument as a duration and run `node ${CLAUDE_PLUGIN_ROOT}/dist/cli.js time-box set "$ARGUMENTS"`.

Example duration forms include `30m`, `45m`, `1h`, and `1h30m`.

If parsing fails, show the CLI error and tell the user to use one of the example forms.

A time-box is different from `/headsdown:extend` and `/headsdown:wrap`:

- `/headsdown:timebox` changes the local warning deadline for this Claude Code session.
- `/headsdown:extend` asks HeadsDown to request more time for an active hosted session timebox when the user explicitly wants more time.
- `/headsdown:wrap` is user-elected and saves a handoff. Never auto-trigger it because a time-box expired.

User provided: $ARGUMENTS
