# Changelog

## Unreleased

- Added `PreCompact` hook: injects active proposal and execution policy into context before compaction so Claude can include in-progress work in its compaction summary.
- Added `PostToolUse` hook: tracks per-session file modification count and warns when actual edits exceed the approved proposal estimate by more than 50%.
- Added `next-window` CLI command: computes minutes until the next availability window transition, used by the session-start hook.
- Enhanced `SessionStart` hook: now injects upcoming window transition warnings (within 60 minutes) including the wrap-up threshold, so Claude plans scope before the window closes.
- Updated `proposals` CLI command: now includes `estimatedFiles` from a companion meta file written at proposal approval time.
- Extended `SKILL.md` with guidance for mid-task scope escalation, wrap-up handoff notes, digest follow-up proposals, proactive session-end outcome reporting, subagent delegation grant verification, and schedule/cron availability awareness.

## 0.1.1

- Adopted `describeExecutionDirective` SDK mapper in Claude surfaces for canonical execution guidance.
- Mapped Wrap-Up guidance to explicit LLM instructions in Claude MCP and skill.
- Adopted Wrap-Up instruction expansion in Claude MCP server.
- Bumped `@headsdown/sdk` to 0.2.12–0.2.13.

## 0.1.0

- Added delegation grants support (`headsdown_grants`): list, create, and revoke actor-scoped grants.
- Added availability overrides support (`headsdown_override`): get, set, and clear temporary mode overrides.
- Synced terminology with latest SDK (availability, contract, schedule, reachability windows).
- Integrated calibration tracking: approved proposals start a `CalibrationTracker`; `headsdown_report` closes the feedback loop.
- Added trust levels (`advisory`, `active`, `guarded`) and sensitive path blocklist to the `PreToolUse` hook.
- Added proposal state tracking so hooks can check approval status without calling the API.
- Added `SessionStart` hook, `/headsdown` slash command, and CLI companion (`cli.ts`).
- Added `PreToolUse` hook to gate file modifications by availability mode.
- Restructured as a Claude Code plugin with skill, MCP server, hooks, and commands.
- Initial release: MCP server with `headsdown_status`, `headsdown_propose`, `headsdown_auth`, `headsdown_digest`, and `headsdown_report`.
