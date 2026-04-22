# headsdown-claude

[HeadsDown](https://headsdown.app) availability plugin for Claude Code. Gives Claude awareness of your focus mode, schedule, and availability before it starts tasks — and keeps it aware throughout.

When installed, Claude will:
1. **Know your availability from the start** via a SessionStart hook that injects your current mode, execution directive, remaining attention budget, upcoming transitions, and continuation artifacts from previous sessions
2. **Check before starting work** via a skill that teaches Claude to submit task proposals for verdict
3. **Respect your focus time** by scoping work appropriately, deferring when you're busy, and producing handoff notes when time runs out
4. **Track scope during work** via a PostToolUse hook that counts file modifications and warns when edits outrun the approved estimate
5. **Survive context compaction** via a PreCompact hook that preserves proposal context so Claude can resume cleanly after the context window is rebuilt
6. **Resume sessions** via continuation artifacts — Claude saves progress on wrap-up and picks up where it left off next session
7. **Auto-report outcomes** via a Stop hook that records completed/partially_completed when the session ends
8. **Gate interruptions** by checking whether it's appropriate to ask you a question before breaking your focus

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

### PostToolUse Hook (Write/Edit)

After each successful file write or edit, the hook:

- Increments a per-session file modification counter (keyed on `CLAUDE_SESSION_ID`)
- Emits a system message noting the running count: "[HeadsDown] 4 file(s) modified this session."
- If an approved proposal exists and actual edits exceed the estimated file count by more than 50%, warns Claude to re-evaluate scope and re-propose before continuing

### PreCompact Hook

Before Claude Code compacts the context window, the hook injects a system message with:

- The active approved proposal description and estimated scope
- The current execution policy (wrap-up guidance)

This allows Claude to include in-progress context in its compaction summary so it can resume the task cleanly after the context is rebuilt. Exits silently if no proposal is active.

### `/headsdown` Command

Quick slash command for direct access:
- `/headsdown` or `/headsdown status` - See your current availability
- `/headsdown auth` - Authenticate with HeadsDown

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
│   ├── check-availability.sh # Gates file modifications by mode (PreToolUse)
│   ├── post-tool-use.sh      # Tracks file modification count (PostToolUse)
│   └── pre-compact.sh        # Preserves proposal context before compaction (PreCompact)
├── .mcp.json                 # MCP server config
├── src/
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

## Data Transparency

This plugin is a thin wrapper around the [HeadsDown SDK](https://github.com/headsdownapp/headsdown-sdk). It sends requests only to the HeadsDown API.

**What is sent:** Task descriptions and scope estimates (when you submit proposals), your API key for authentication, and actor context metadata (`source`, `agentId`, `sessionId`, `workspaceRef`) for delegated authorization paths.

**What is received:** Your availability status, execution directive, task verdicts, and digest summaries (aggregated notifications).

**What is stored locally:** Your API key at `~/.config/headsdown/credentials.json` (0600 permissions). Continuation artifacts at `~/.config/headsdown/continuation.json` (0600 permissions, consumed on next session load).

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

## License

MIT
