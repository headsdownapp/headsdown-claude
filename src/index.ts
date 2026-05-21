#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  if (process.argv[2] === "referee") {
    await import("./cli.js");
    return;
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("HeadsDown MCP server failed to start:", error);
  process.exit(1);
});
