# headsdown-claude

[HeadsDown](https://headsdown.app) availability plugin for Claude Code. Gives Claude awareness of your focus mode, schedule, and availability before it starts tasks — and keeps it aware throughout.

When installed, Claude will:
1. **Know your availability from the start** via a SessionStart hook that injects your current mode, active window, time remaining, upcoming transitions, and wrap-up guidance
2. **Check before starting work** via a skill that teaches Claude to submit task proposals for verdict
3. **Respect your focus time** by scoping work appropriately, deferring when you're busy, and producing handoff notes when time runs out
4. **Track scope during work** via a PostToolUse hook that counts file modifications and warns when edits outrun the approved estimate
5. **Survive context compaction** via a PreCompact hook that preserves proposal context so Claude can resume cleanly after the context window is rebuilt
6. **Show what you missed** via a digest of notifications that arrived during focus mode, with offers to queue actionable items as follow-up proposals

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

- Current mode, status text, and time remaining
- Whether you're in available hours and which window is active
- Wrap-up execution guidance (when near a deadline)
- Upcoming window transition warning if one is within 60 minutes (e.g., "Work hours end in 45 minutes — wrap-up threshold at 15 minutes")
- Pending digest count if notifications arrived during your last focus session

If you're not authenticated or the API is unreachable, the hook exits silently (no disruption).

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

### MCP Tools

Seven tools registered via the plugin's MCP server:

**`headsdown_status`** - Check your current availability. Returns mode, status message, time remaining, and availability state.

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

**`headsdown_report`** - Report the outcome of a task approved via `headsdown_propose`. Helps HeadsDown calibrate future verdicts.

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
SessionStart hook ──► [HeadsDown] Mode: busy, 🔨 Deep work, 120min remaining
         │
         ▼
Claude already knows your status. User asks for a big refactor.
         │
         ▼
headsdown_propose ──► { decision: "deferred", reason: "..." }
         │
         ▼
Claude tells you: "You're in focus mode. Want me to defer this,
                   or should I scope it down to a quick fix?"
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
│   ├── session-start.sh      # Injects availability at session start
│   ├── check-availability.sh # Gates file modifications by mode (PreToolUse)
│   ├── post-tool-use.sh      # Tracks file modification count (PostToolUse)
│   └── pre-compact.sh        # Preserves proposal context before compaction
├── .mcp.json                 # MCP server config
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── server.ts             # Tool handlers
│   └── cli.ts                # Lightweight CLI for hooks/commands
├── test/
│   └── server.test.ts        # 82 tests
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

**What is received:** Your availability status, availability state, task verdicts, and digest summaries (aggregated notifications).

**What is stored locally:** Your API key at `~/.config/headsdown/credentials.json` (0600 permissions).

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
