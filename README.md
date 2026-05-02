# headsdown-claude

[HeadsDown](https://headsdown.app) run-governance plugin for Claude Code. It keeps Claude productive inside real-world boundaries like scope, time, off-clock windows, and approval moments.

Claude Code controls the model. HeadsDown controls the run.

When installed, HeadsDown helps Claude:
1. **Keep scope tight** by checking work against approved slices and warning before scope drifts
2. **Queue non-urgent asks off the clock** so evening and weekend interruptions wait for the next work window
3. **Use approval gates** before broad or risky changes
4. **Pause and save handoffs** when a run should stop or narrow before new work starts
5. **Resume without rework** via continuation artifacts saved at wrap-up
6. **Report outcomes** so future calls improve based on results, not raw content
7. **Gate interruptions** by checking whether it is the right moment to ask you mid-run

## Install

### From a marketplace (when published)

```
/plugin install headsdown
```

### From a local directory

```bash
git clone https://github.com/headsdownapp/headsdown-claude.git
cd headsdown-claude
npm install
npm run build
```

Then start Claude Code with the plugin:

```bash
claude --plugin-dir /path/to/headsdown-claude
```

Or add it to your settings for permanent use.

## Setup

Authenticate with HeadsDown after installing:

```
/headsdown auth
```

Or ask Claude: "Run headsdown_auth to connect my HeadsDown account"

This starts a Device Flow: you visit a URL, enter a code, and the API key is saved locally at `~/.config/headsdown/credentials.json`.

## Why HeadsDown in Claude Code

HeadsDown is not a replacement for Claude model selection. Claude Code already handles Anthropic model behavior, including `/auto`.

HeadsDown value in Claude is run governance:
- scope control
- off-clock queueing
- approval gates
- pause and handoff
- ready-to-resume continuity
- privacy-safe outcome reporting

Canonical product language and UX guidance live in:
- [AGENT_CONTROL_BRAND_LANGUAGE.md](https://github.com/headsdownapp/heads_down/blob/main/docs/AGENT_CONTROL_BRAND_LANGUAGE.md)
- [AGENT_CONTROL_HIGH_FIDELITY_UX.md](https://github.com/headsdownapp/heads_down/blob/main/docs/AGENT_CONTROL_HIGH_FIDELITY_UX.md)

## Run Governance Examples

### Keep it tight

```text
HEADSDOWN CALL
Keep it tight
This is no longer the task you approved. Narrow scope before continuing.

Recommended action: narrow_scope
```

### Off the clock

```text
HEADSDOWN CALL
Off the clock
Non-urgent work waits for your next work window. Save the handoff and queue for morning.

Recommended action: queue_for_morning
```


## What's in the Plugin

### SessionStart Hook

Every time Claude Code starts a session, the hook injects your current availability into Claude's context before you say anything:

- **Axis 1** — availability mode (user-set): online/busy/limited/offline
- **Axis 2** — execution directive (schedule-derived): proceed/proceed_with_caution/defer, with machine-readable `hardLimits`
- Whether you're in available hours and which window is active
- Remaining attention budget in minutes (when a window is ending)
- Wrap-up execution guidance (when near a deadline)
- Upcoming window transition warning if one is within 60 minutes
- Pending digest count if notifications arrived during your last focus session
- Continuation prompt if a previous session left resumable work

If you're not authenticated or the API is unreachable, the hook exits silently (no disruption).

### Stop Hook

When a Claude session ends, the hook automatically reports task outcome to HeadsDown:

- `completed` — if the session ended normally with no continuation artifact
- `partially_completed` — if a continuation artifact exists (work was deferred)

This closes the feedback loop for calibration without requiring Claude to remember to call `headsdown_report`. Manual reporting is still needed for `failed`, `cancelled`, or `timed_out` outcomes.

### PreToolUse Hook (Write/Edit)

Before Claude writes or edits any file, the hook checks your current mode:

| Mode | Behavior |
|------|----------|
| **online** | Silent pass. No interruption. |
| **busy** | Allow, but inject a warning: "Submit a proposal via headsdown_propose before continuing." |
| **busy + locked** | Ask the user for explicit permission. Status is locked = do not disturb. |
| **limited** | Allow, but remind Claude to keep changes small and focused. |
| **offline** | Ask the user for explicit permission. All changes should be deferred. |

Behavior is controlled by trust level (see [Trust levels](#trust-levels) below).

### PostToolUse Hook (All Tools)

After each tool call, the hook:

- Increments a per-session file modification counter for write-like tools (keyed on `CLAUDE_SESSION_ID`)
- Emits a system message for write operations noting the running count: "[HeadsDown] 4 file(s) modified this session."
- If an approved proposal exists and actual edits exceed the estimated file count by more than 50%, warns Claude to re-evaluate scope and re-propose before continuing
- Refreshes Claude-visible `additionalContext` while `attention_window_closing` is active so wrap-up hints stay current and action constraints remain explicit (`/headsdown:extend` is user-requested, `/headsdown:wrap` is user-elected)

### Attention Window Monitor

A plugin monitor polls HeadsDown during active runs and emits a notification when a new `attention_window_closing` warning fingerprint appears (deadline + threshold). This enables mid-flow warning visibility even during long stretches between tool boundaries.

### PreCompact Hook

Before Claude Code compacts the context window, the hook injects a system message with:

- The active approved proposal description and estimated scope
- The current execution policy (wrap-up guidance)

This allows Claude to include in-progress context in its compaction summary so it can resume the task cleanly after the context is rebuilt. Exits silently if no proposal is active.

### Slash Commands

Quick slash commands for direct access:
- `/headsdown` or `/headsdown status` - See your current availability
- `/headsdown auth` - Authenticate with HeadsDown
- `/headsdown:box <duration>` - Declare a session-scoped local deadline like `30m`, `45m`, `1h`, or `1h30m`
- `/headsdown:box status` - Show the active box deadline, remaining time, and warning threshold
- `/headsdown:box clear` - Clear the local box so future warnings use backend-derived attention-window behavior when available
- `/headsdown:extend [minutes]` - Apply `allow_for_duration` to an active window-closing run (defaults to 15)
- `/headsdown:wrap` - Apply `pause_and_summarize` with a privacy-safe handoff for an active window-closing run

### `headsdown` Skill

A SKILL.md that teaches Claude when and how to check availability. Claude loads this contextually before starting tasks, so it knows to check your status and submit proposals for non-trivial work.

Key behaviors the skill teaches:
- Read both axes (mode + execution directive) before starting
- Decompose tasks that exceed the remaining attention budget into window-sized slices
- Match commit cadence to execution policy (frequent small commits in wrap_up, batched in full_depth)
- Gate non-critical mid-task questions through `headsdown_interrupt`
- Save continuation artifacts on wrap-up; resume from them next session
- Cross-reference digest entries with current work; surface only relevant items in busy/limited mode

### MCP Tools

Nine tools registered via the plugin's MCP server:

**`headsdown_status`** - Check your current availability. Returns both axes: `mode` (user-set) and `executionDirective` (schedule-derived with `code`, `summary`, `hardLimits`).

**`headsdown_propose`** - Submit a task proposal. Returns a verdict:
- **Approved**: Claude proceeds
- **Deferred**: Claude informs you and suggests postponing or reducing scope

| Parameter | Required | Description |
|-----------|----------|-------------|
| `description` | Yes | What Claude plans to do |
| `estimated_files` | No | Number of files to modify |
| `estimated_minutes` | No | Expected duration |
| `scope_summary` | No | Which modules, what kind of changes |
| `source_ref` | No | Ticket number, PR URL, etc. |
| `delivery_mode` | No | `auto` (default), `wrap_up`, or `full_depth` to override execution policy |

**`headsdown_interrupt`** - Check whether it's appropriate to interrupt the user mid-task. Call this before asking non-critical clarifying questions. Returns `{ allowed, reason, autoResponse }` — if `allowed` is false, use `autoResponse` text instead of asking.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `handle` | No | Interrupt type: `clarifying_question`, `scope_change`, `error`, `status_update` |

**`headsdown_continuation`** - Save or load a structured continuation artifact for resumable work sessions.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `action` | Yes | `save` or `load` |
| `branch` | No | Current git branch (for save) |
| `completed_steps` | No | Steps finished this session (for save) |
| `pending_steps` | No | Steps remaining (for save) |
| `dirty_files` | No | Files with uncommitted changes (for save) |
| `open_decisions` | No | Questions needing user input (for save) |
| `resume_instruction` | No | One-sentence next-step for the next session (for save) |

**`headsdown_digest`** - View notifications and messages that arrived during focus time. Returns grouped summaries by source and actor. Read-only.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `latest` | No | Limit to N most recent summaries (default: 20) |

**`headsdown_grants`** - List/create/revoke delegation grants for actor-scoped authorization.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `action` | No | list_active, list, create, revoke, revoke_many (default: list_active) |
| `id` | No | Grant id for revoke |
| `scope` | No | session, workspace, agent |
| `session_id` | No | Session identifier |
| `workspace_ref` | No | Workspace reference |
| `agent_id` | No | Agent identifier |
| `permissions` | No | availability_override_create, availability_override_cancel, preset_apply |
| `duration_minutes` | No | Relative expiry for create |
| `expires_at` | No | Absolute expiry for create |
| `source` | No | Audit source label |
| `active` | No | Active filter for list/revoke_many |

**`headsdown_override`** - Get/set/clear temporary availability overrides.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `action` | No | get, set, clear (default: get) |
| `id` | No | Override id for clear |
| `mode` | No | online, busy, limited, offline (required for set) |
| `duration_minutes` | No | Relative expiry for set |
| `expires_at` | No | Absolute expiry for set |
| `reason` | No | Optional reason for set/clear |

**`headsdown_report`** - Report the outcome of a task approved via `headsdown_propose`. The Stop hook auto-reports `completed`/`partially_completed` at session end; call this manually for `failed`, `cancelled`, or `timed_out`.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `outcome` | Yes | completed, failed, partially_completed, cancelled, timed_out |
| `error_category` | No | Category of error if failed |
| `tests_passed` | No | Whether changes pass tests |

**`headsdown_auth`** - Authenticate via Device Flow.

## Trust levels

Control how strictly the PreToolUse hook enforces availability. Set in your plugin config:

```json
{
  "headsdown": {
    "trustLevel": "advisory",
    "sensitivePaths": [".env", "credentials.json", "secrets/**"]
  }
}
```

| Level | Behavior |
|-------|----------|
| `advisory` (default) | Warns Claude; only blocks writes when locked or offline |
| `active` | Auto-approves writes when an approved proposal exists; warns otherwise |
| `guarded` | Requires an approved proposal before any write in busy/limited/offline modes |

Sensitive path patterns always force an explicit permission prompt regardless of trust level.

## How It Works

```
You set your focus mode in HeadsDown (busy for 2 hours)
         │
         ▼
Claude Code starts a session
         │
         ▼
SessionStart hook ──► [HeadsDown] Axis 1 (mode): busy | Axis 2 (directive): proceed_with_caution
                                  Remaining attention budget: 45 minutes
         │
         ▼
Claude already knows your status. User asks for a big refactor.
         │
         ▼
headsdown_propose ──► { decision: "deferred", reason: "..." }
         │
         ▼
Claude tells you: "You're in focus mode with 45 minutes left.
                   I can do the types layer now and defer the rest."
         │
         ▼
Session ends
         │
         ▼
Stop hook ──► headsdown_report: partially_completed (continuation artifact exists)
Next session ──► [Continuation] Branch: main. 2 steps remaining. Resume: finish service layer tests.
```

## Plugin Structure

```
headsdown-claude/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest
├── skills/
│   └── headsdown/
│       └── SKILL.md          # Agent behavioral instructions
├── commands/
│   └── headsdown.md          # /headsdown slash command
├── hooks/
│   ├── hooks.json            # Hook configuration
│   ├── session-start.sh      # Injects availability at session start (SessionStart)
│   ├── session-end.sh        # Auto-reports outcome at session end (Stop)
│   ├── autopilot-detect-deferral.sh # Records metadata-only deferrals and nudges (Stop)
│   ├── autopilot-intercept-ask.sh # Defers AskUserQuestion during autopilot (PreToolUse)
│   ├── autopilot-prompt.sh # Injects fresh SDK autopilot policy context (UserPromptSubmit)
│   ├── check-availability.sh # Gates file modifications by mode (PreToolUse)
│   ├── post-tool-use.sh      # Tracks file modification count (PostToolUse)
│   └── pre-compact.sh        # Preserves proposal context before compaction (PreCompact)
├── .mcp.json                 # MCP server config
├── src/
│   ├── autopilot/            # Local autopilot state, deferral detection, and CLI handlers
│   ├── index.ts              # MCP server entry point
│   ├── server.ts             # Tool handlers (9 tools)
│   └── cli.ts                # Lightweight CLI for hooks/commands
├── test/
│   └── server.test.ts        # 117 tests
├── package.json
└── README.md
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HEADSDOWN_API_URL` | `https://headsdown.app` | API endpoint (for development) |
| `HEADSDOWN_API_KEY` | (from credentials file) | Override the stored API key |
| `HEADSDOWN_AUTOPILOT_CONFIG_PATH` | `~/.config/headsdown/autopilot-config.json` | Override the local autopilot deferral config path |
| `HEADSDOWN_AUTOPILOT_STATE_PATH` | `~/.config/headsdown/autopilot-state.json` | Override the local autopilot state path |

### Autopilot deferral detection and anti-stuck nudges

Autopilot deferral capture is local-first. The Stop hook reads the last assistant turn, checks the current availability mode, and records a metadata-only deferred-decision event when a configurable pattern matches. Raw assistant text stays local and is never sent in the event payload.

Default autopilot behavior is enabled for `offline` mode. `limited` mode is opt-in with `includeLimitedMode`. A `UserPromptSubmit` hook reads the current mode and fresh per-mode policy before each turn, then injects the SDK-rendered classifier prompt fragments as Claude `additionalContext`. SessionStart preloads the same addendum for the first turn. When a matching Stop event is recorded, the hook can exit 2 with an anti-stuck nudge so Claude continues without waiting. A separate `AskUserQuestion` PreToolUse hook denies the ask in autopilot mode and tells Claude to defer instead.

```json
{
  "enabled": true,
  "includeLimitedMode": false,
  "defaultUrgencyBucket": "normal",
  "modeCacheMs": 60000,
  "nudgeCooldownMs": 5000,
  "maxConsecutiveNudges": 4,
  "latitudeDefault": "balanced",
  "identityActionOverrides": [],
  "houseRules": [],
  "patterns": [
    { "key": "needs_decision", "pattern": "NEEDS_DECISION", "urgencyBucket": "high" }
  ]
}
```

If `patterns` is omitted or invalid, built-in defaults are used. Defaults cover `[DEFER]`, `[NEEDS_USER]`, `[NEEDS_DECISION]`, `should I`, `would you like`, `do you want`, `awaiting your decision`, `let me know`, `please confirm`, `which would you prefer`, and trailing second-person questions. Prompt injection and nudge text use the SDK classifier prompt fragments and escalation helper so local policy language stays aligned with the shared classifier taxonomy. Policy is not cached across turns. When SessionStart observes a return to online mode, the wake-up handler can inject a derived-facts digest that points the user to `headsdown_deferred` for review and resolution. The digest shows counts, buckets, flags, and timestamps only.

## Data Transparency

This plugin is a thin wrapper around the [HeadsDown SDK](https://github.com/headsdownapp/headsdown-sdk). It sends requests only to the HeadsDown API.

**What is sent:** Task descriptions and scope estimates (when you submit proposals), metadata-only agent-run events, deferred-decision metadata, your API key for authentication, and actor context metadata (`source`, `agentId`, `sessionId`, `workspaceRef`) for delegated authorization paths.

**What is received:** Your availability status, execution directive, task verdicts, digest summaries (aggregated notifications), and metadata-only deferred-decision events for review.

**What is stored locally:** Your API key at `~/.config/headsdown/credentials.json` (0600 permissions). Continuation artifacts at `~/.config/headsdown/continuation.json` (0600 permissions, consumed on next session load). Session-scoped box deadlines at `~/.config/headsdown/time-box-<session-hash>.json` (0600 permissions), containing the session hash plus timestamp, duration, schema, and source metadata. Autopilot state at `~/.config/headsdown/autopilot-state.json` (0600 permissions), containing only mode cache metadata, counters, cooldown timestamps, local dedupe keys, and surfaced decision IDs.

No telemetry. No analytics. No third-party requests.

## Development

```bash
git clone https://github.com/headsdownapp/headsdown-claude.git
cd headsdown-claude
npm install
npm run build
npm test

# Validate plugin structure
claude plugins validate .
```

## Build and packaging notes

`npm run build` bundles `src/index.ts` and `src/cli.ts` with esbuild into `dist/index.js` and `dist/cli.js`.

The bundle inlines `@headsdown/sdk` so consumers do not install it transitively when they install `headsdown-claude`. `@modelcontextprotocol/sdk` stays external as a runtime dependency.

## Dependency update automation

This repo uses Renovate to keep `@headsdown/sdk` and other routine dependencies current. New SDK releases open bot PRs automatically, and eligible updates can automerge after required CI checks pass. In normal maintenance flow, do not manually edit `@headsdown/sdk` versions unless you are intentionally overriding Renovate behavior.

## License

MIT
