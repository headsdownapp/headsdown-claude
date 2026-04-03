# headsdown-claude-ext

[HeadsDown](https://headsdown.app) availability plugin for Claude Code. Gives Claude awareness of your focus mode, schedule, and availability before it starts tasks.

When installed, Claude will:
1. **Check your availability** before starting significant work
2. **Submit task proposals** for a verdict (approved or deferred)
3. **Respect your focus time** by scoping work appropriately or deferring

## Install

### From a marketplace (when published)

```
/plugin install headsdown
```

### From a local directory

```bash
git clone https://github.com/headsdownapp/headsdown-claude-ext.git
cd headsdown-claude-ext
npm install
npm run build
```

Then start Claude Code with the plugin:

```bash
claude --plugin-dir /path/to/headsdown-claude-ext
```

Or add it to your settings for permanent use.

## Setup

The first time Claude tries to check your availability, it will see you're not authenticated and offer to run the auth flow. You can also trigger it manually:

> "Run headsdown_auth to connect my HeadsDown account"

This starts a Device Flow: Claude gives you a URL and code, you approve in your browser, and the API key is saved locally at `~/.config/headsdown/credentials.json`.

## What's in the Plugin

This plugin bundles three components:

### Skill: `headsdown`

A SKILL.md that teaches Claude when and how to check availability. Claude loads this contextually before starting tasks, so it knows to check your status without being told. Invoke it manually with `/headsdown` if needed.

### MCP Tools

Three tools registered via the plugin's MCP server:

**`headsdown_status`** - Check your current availability. Returns:
- Mode (online, busy, limited, offline)
- Status message and emoji
- Time remaining
- Work schedule context

**`headsdown_propose`** - Submit a task proposal. Returns a verdict:
- **Approved**: Claude proceeds with the task
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

## Plugin Structure

```
headsdown-claude-ext/
├── .claude-plugin/
│   └── plugin.json        # Plugin manifest
├── skills/
│   └── headsdown/
│       └── SKILL.md       # Agent behavioral instructions
├── .mcp.json              # MCP server config
├── src/
│   ├── index.ts           # MCP server entry point
│   └── server.ts          # Tool handlers (~200 lines)
├── test/
│   └── server.test.ts     # MCP + plugin structure tests
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

The server is ~200 lines. Read it: [`src/server.ts`](src/server.ts).

No telemetry. No analytics. No third-party requests.

## Development

```bash
git clone https://github.com/headsdownapp/headsdown-claude-ext.git
cd headsdown-claude-ext
npm install
npm run build
npm test
```

Validate the plugin manifest:
```bash
claude plugins validate .
```

## License

MIT
