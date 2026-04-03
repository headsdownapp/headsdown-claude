# headsdown-claude-ext

[HeadsDown](https://headsdown.app) availability extension for Claude Code. Gives Claude awareness of your focus mode, schedule, and availability before it starts tasks.

When installed, Claude Code will:
1. **Check your availability** before starting significant work
2. **Submit task proposals** for a verdict (approved or deferred)
3. **Respect your focus time** by scoping work appropriately or deferring

## Install

```bash
# Install globally
npm install -g headsdown-claude-ext

# Add to Claude Code as an MCP server
claude mcp add headsdown -- headsdown-claude-ext
```

Or run directly with npx:

```bash
claude mcp add headsdown -- npx headsdown-claude-ext
```

## Setup

The first time Claude tries to check your availability, it will see you're not authenticated and offer to run the auth flow. You can also trigger it manually:

> "Run headsdown_auth to connect my HeadsDown account"

This starts a Device Flow: Claude gives you a URL and code, you approve in your browser, and the API key is saved locally at `~/.config/headsdown/credentials.json`.

## Tools

The extension provides three MCP tools:

### `headsdown_status`

Check your current availability. Returns:
- **Mode**: online, busy, limited, or offline
- **Status**: emoji and text (e.g., "🔨 Deep work")
- **Time remaining**: minutes until the current mode expires
- **Schedule**: work hours, off hours, next workday

Claude calls this before starting tasks to understand your context.

### `headsdown_propose`

Submit a task proposal for HeadsDown to evaluate against your availability. Returns a verdict:

- **Approved**: Claude proceeds with the task as described
- **Deferred**: Claude informs you and suggests postponing or reducing scope

Parameters:
| Name | Required | Description |
|------|----------|-------------|
| `description` | Yes | What Claude plans to do |
| `estimated_files` | No | Number of files to modify |
| `estimated_minutes` | No | Expected duration |
| `scope_summary` | No | Which modules, what kind of changes |
| `source_ref` | No | Ticket number, PR URL, etc. |

### `headsdown_auth`

Authenticate with HeadsDown via Device Flow. Run this if the other tools report authentication errors.

## How It Works

```
You set your focus mode in HeadsDown (busy for 2 hours)
         │
         ▼
Claude Code starts a task
         │
         ▼
headsdown_status ──► "User is busy, 90 min remaining, 🔨 Deep work"
         │
         ▼
headsdown_propose ──► { decision: "deferred", reason: "..." }
         │
         ▼
Claude tells you: "You're in focus mode. Want me to defer this,
                   or should I scope it down to a quick fix?"
```

## Configuration

The extension respects these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `HEADSDOWN_API_URL` | `https://headsdown.app` | API endpoint (for development) |
| `HEADSDOWN_API_KEY` | (from credentials file) | Override the stored API key |

## Data Transparency

This extension is a thin MCP wrapper around the [HeadsDown SDK](https://github.com/headsdownapp/headsdown-sdk). It sends requests only to the HeadsDown API.

**What is sent:** Task descriptions and scope estimates (when you submit proposals), your API key for authentication.

**What is received:** Your availability status, work schedule, and task verdicts.

**What is stored locally:** Your API key at `~/.config/headsdown/credentials.json` (0600 permissions).

The source is ~200 lines. Read it: [`src/server.ts`](src/server.ts).

No telemetry. No analytics. No third-party requests.

## Development

```bash
git clone https://github.com/headsdownapp/headsdown-claude-ext.git
cd headsdown-claude-ext
npm install
npm run build
npm test
```

## License

MIT
