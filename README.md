# headsdown-claude

[HeadsDown](https://headsdown.app) availability plugin for Claude Code. Gives Claude awareness of your focus mode, schedule, and availability before it starts tasks.

When installed, Claude will:
1. **Know your availability from the start** via a SessionStart hook that injects your current mode into context
2. **Check before starting work** via a skill that teaches Claude to submit task proposals
3. **Respect your focus time** by scoping work appropriately or deferring when you're busy

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

Every time Claude Code starts a session, the hook calls the HeadsDown API and injects your current availability into Claude's context. Claude knows your mode, status, and schedule before you say anything. If you're not authenticated or the API is unreachable, the hook exits silently (no disruption).

### PreToolUse Hook (Write/Edit)

Before Claude writes or edits any file, the hook checks your current mode:

| Mode | Behavior |
|------|----------|
| **online** | Silent pass. No interruption. |
| **busy** | Allow, but inject a warning: "Submit a proposal via headsdown_propose before continuing." |
| **busy + locked** | Ask the user for explicit permission. Status is locked = do not disturb. |
| **limited** | Allow, but remind Claude to keep changes small and focused. |
| **offline** | Ask the user for explicit permission. All changes should be deferred. |

This is the enforcement layer. The skill suggests checking availability; this hook requires it.

### `/headsdown` Command

Quick slash command for direct access:
- `/headsdown` or `/headsdown status` - See your current availability
- `/headsdown auth` - Authenticate with HeadsDown

### `headsdown` Skill

A SKILL.md that teaches Claude when and how to check availability. Claude loads this contextually before starting tasks, so it knows to check your status and submit proposals for non-trivial work.

### MCP Tools

Three tools registered via the plugin's MCP server:

**`headsdown_status`** - Check your current availability. Returns mode, status message, time remaining, and schedule.

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

**`headsdown_auth`** - Authenticate via Device Flow.

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
│   └── check-availability.sh # Gates file modifications by mode
├── .mcp.json                 # MCP server config
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── server.ts             # Tool handlers
│   └── cli.ts                # Lightweight CLI for hooks/commands
├── test/
│   └── server.test.ts        # 35 tests
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

**What is sent:** Task descriptions and scope estimates (when you submit proposals), your API key for authentication.

**What is received:** Your availability status, work schedule, and task verdicts.

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
