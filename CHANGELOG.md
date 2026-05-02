# Changelog

## Unreleased

- Track the built `dist/` bundle in git so `/plugin install` works without a Node toolchain on the install host.
- Added `.claude-plugin/marketplace.json` so the repo can be added directly via `/plugin marketplace add headsdownapp/headsdown-claude`.
- Added a CI guard that fails the build if committed `dist/` drifts from `src/`.
- Documented the `headsdown_deferred` MCP tool in the README and corrected the tool count.
- Clarified that plugin config (`trustLevel`, `sensitivePaths`, `calibration`) lives at `~/.config/headsdown/config.json` as a flat JSON object.
- Refreshed install instructions to lead with the marketplace flow and document the `--plugin-dir` development path.

## 0.2.0

- Added `headsdown_deferred` MCP tool plus `/headsdown:wake-up` slash command for reviewing metadata-only deferred decisions captured during autopilot.
- Added autopilot anti-stuck nudges: the Stop hook records deferred-decision events locally and exits with a nudge so Claude continues without waiting for input.
- Added `UserPromptSubmit` hook that injects fresh per-mode SDK-rendered autopilot policy fragments before each turn.
- Added `AskUserQuestion` PreToolUse intercept: denies the ask in autopilot mode and tells Claude to defer instead.
- Added autopilot wake-up digest: when SessionStart sees a return to online mode it surfaces counts, buckets, and timestamps for review through `headsdown_deferred`.
- Added `/headsdown:box`, `/headsdown:extend`, and `/headsdown:wrap` slash commands plus `time-box` CLI for session-scoped local deadlines.
- Added attention-window-closing call handling: a plugin monitor polls during active runs and emits a notification when a new warning fingerprint appears.
- Added HeadsDown call rendering and Claude-action-to-HeadsDown-action mapping so directives like "Off the clock" and "Keep it tight" surface in Claude output.
- Added off-clock queue flow and privacy-safe Claude run progress reporting.
- Added `PreCompact` hook: injects active proposal and execution policy into context before compaction so Claude can include in-progress work in its compaction summary.
- Added `PostToolUse` hook: tracks per-session file modification count and warns when actual edits exceed the approved proposal estimate by more than 50%.
- Added `next-window` CLI command: computes minutes until the next availability window transition, used by the session-start hook.
- Enhanced `SessionStart` hook: now injects upcoming window transition warnings (within 60 minutes) including the wrap-up threshold, so Claude plans scope before the window closes.
- Updated `proposals` CLI command: now includes `estimatedFiles` from a companion meta file written at proposal approval time.
- Extended `SKILL.md` with guidance for mid-task scope escalation, wrap-up handoff notes, digest follow-up proposals, proactive session-end outcome reporting, subagent delegation grant verification, and schedule/cron availability awareness.
- Bundled the distributable and inlined the HeadsDown SDK so consumers do not install it transitively.
- Automated `@headsdown/sdk` dependency bumps via Renovate.

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
