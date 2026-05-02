---
description: Connect this machine to your HeadsDown account
allowed-tools: mcp__headsdown__headsdown_auth
---

# HeadsDown Auth

Run the `headsdown_auth` MCP tool to start the Device Flow. Show the user the verification URL and code, wait for them to approve in the browser, and confirm once the API key is saved at `~/.config/headsdown/credentials.json`.

If the user is already authenticated, the tool will say so — surface that result instead of starting a new flow.
