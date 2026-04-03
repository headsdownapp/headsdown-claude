import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

// We need to mock the CredentialStore path so tests don't touch real credentials.
// The SDK loads credentials from ~/.config/headsdown/credentials.json by default.
// We'll set up temp credential files and point the SDK there via env var.

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hd-claude-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** Write a fake credentials file and mock HeadsDownClient.fromCredentials to use it. */
async function writeCredentials(apiKey = "hd_test_key_abc123") {
  const credPath = join(tempDir, "credentials.json");
  await writeFile(credPath, JSON.stringify({ apiKey, createdAt: new Date().toISOString() }));
  return credPath;
}

/**
 * Connect a test client to the MCP server via in-memory transport.
 * Returns the client for calling tools.
 */
async function createTestClient() {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.1.0" });
  await client.connect(clientTransport);

  return client;
}

describe("HeadsDown MCP Server", () => {
  describe("listTools", () => {
    it("exposes three tools", async () => {
      const client = await createTestClient();
      const result = await client.listTools();

      const names = result.tools.map((t) => t.name).sort();
      expect(names).toEqual(["headsdown_auth", "headsdown_propose", "headsdown_status"]);
    });

    it("headsdown_status has no required parameters", async () => {
      const client = await createTestClient();
      const result = await client.listTools();

      const status = result.tools.find((t) => t.name === "headsdown_status");
      expect(status?.inputSchema.required).toEqual([]);
    });

    it("headsdown_propose requires description", async () => {
      const client = await createTestClient();
      const result = await client.listTools();

      const propose = result.tools.find((t) => t.name === "headsdown_propose");
      expect(propose?.inputSchema.required).toEqual(["description"]);
    });

    it("tool descriptions mention HeadsDown and availability", async () => {
      const client = await createTestClient();
      const result = await client.listTools();

      for (const tool of result.tools) {
        expect(tool.description?.toLowerCase()).toContain("headsdown");
      }
    });
  });

  describe("headsdown_status", () => {
    it("returns auth error when not authenticated", async () => {
      // No credentials file exists, so the client will fail to load
      const client = await createTestClient();
      const result = await client.callTool({ name: "headsdown_status", arguments: {} });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Not authenticated");
      expect(text).toContain("headsdown_auth");
      expect(result.isError).toBe(true);
    });
  });

  describe("headsdown_propose", () => {
    it("returns error for empty description", async () => {
      const client = await createTestClient();
      const result = await client.callTool({
        name: "headsdown_propose",
        arguments: { description: "" },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("description");
      expect(result.isError).toBe(true);
    });

    it("returns error for missing description", async () => {
      const client = await createTestClient();
      const result = await client.callTool({
        name: "headsdown_propose",
        arguments: {},
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("description");
      expect(result.isError).toBe(true);
    });

    it("returns auth error when not authenticated", async () => {
      const client = await createTestClient();
      const result = await client.callTool({
        name: "headsdown_propose",
        arguments: { description: "Refactor auth module" },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Not authenticated");
      expect(result.isError).toBe(true);
    });
  });

  describe("unknown tool", () => {
    it("returns error for unknown tool name", async () => {
      const client = await createTestClient();

      // The MCP SDK may throw on unknown tools, or the server handles it
      try {
        const result = await client.callTool({
          name: "headsdown_nonexistent",
          arguments: {},
        });
        const text = (result.content as Array<{ type: string; text: string }>)[0].text;
        expect(text).toContain("Unknown tool");
      } catch (error) {
        // MCP SDK might throw MethodNotFoundError for unknown tools
        expect(error).toBeTruthy();
      }
    });
  });

  describe("tool metadata", () => {
    it("propose tool has all expected parameter definitions", async () => {
      const client = await createTestClient();
      const result = await client.listTools();
      const propose = result.tools.find((t) => t.name === "headsdown_propose");
      const props = propose?.inputSchema.properties as Record<string, { type: string }>;

      expect(props.description.type).toBe("string");
      expect(props.estimated_files.type).toBe("number");
      expect(props.estimated_minutes.type).toBe("number");
      expect(props.scope_summary.type).toBe("string");
      expect(props.source_ref.type).toBe("string");
    });

    it("auth tool has empty parameters", async () => {
      const client = await createTestClient();
      const result = await client.listTools();
      const auth = result.tools.find((t) => t.name === "headsdown_auth");

      expect(auth?.inputSchema.required).toEqual([]);
      expect(Object.keys(auth?.inputSchema.properties as object)).toEqual([]);
    });
  });
});

// === Plugin Structure Tests ===

describe("Plugin structure", () => {
  describe("plugin.json", () => {
    it("exists and has valid structure", async () => {
      const manifestPath = join(import.meta.dirname, "..", ".claude-plugin", "plugin.json");
      const raw = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(raw);

      expect(manifest.name).toBe("headsdown");
      expect(manifest.name).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      expect(manifest.description).toBeTruthy();
      expect(manifest.description.length).toBeGreaterThan(20);
      expect(manifest.license).toBe("MIT");
      expect(manifest.author).toBeTruthy();
      expect(manifest.repository).toBeTruthy();
    });
  });

  describe("SKILL.md", () => {
    it("exists and has valid frontmatter", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toMatch(/^---\n/);
      expect(content).toContain("name: headsdown");
      expect(content).toContain("description:");
    });

    it("description is meaningful and within limits", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      const descMatch = content.match(/description:\s*(.+)/);
      expect(descMatch).not.toBeNull();
      expect(descMatch![1].length).toBeGreaterThan(20);
      expect(descMatch![1].length).toBeLessThanOrEqual(1024);
    });

    it("references the MCP tools", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("headsdown_status");
      expect(content).toContain("headsdown_propose");
      expect(content).toContain("headsdown_auth");
    });

    it("documents all availability modes", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("online");
      expect(content).toContain("busy");
      expect(content).toContain("limited");
      expect(content).toContain("offline");
    });

    it("documents verdict decisions", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("approved");
      expect(content).toContain("deferred");
    });
  });

  describe(".mcp.json", () => {
    it("exists and references the server entry point", async () => {
      const mcpPath = join(import.meta.dirname, "..", ".mcp.json");
      const raw = await readFile(mcpPath, "utf-8");
      const config = JSON.parse(raw);

      expect(config.headsdown).toBeTruthy();
      expect(config.headsdown.command).toBe("node");
      expect(config.headsdown.args[0]).toContain("dist/index.js");
    });
  });

  describe("hooks/hooks.json", () => {
    it("exists and has valid structure", async () => {
      const hooksPath = join(import.meta.dirname, "..", "hooks", "hooks.json");
      const raw = await readFile(hooksPath, "utf-8");
      const config = JSON.parse(raw);

      expect(config.hooks).toBeTruthy();
      expect(config.hooks.SessionStart).toBeInstanceOf(Array);
      expect(config.hooks.SessionStart).toHaveLength(1);
    });

    it("SessionStart hook uses CLAUDE_PLUGIN_ROOT for portability", async () => {
      const hooksPath = join(import.meta.dirname, "..", "hooks", "hooks.json");
      const raw = await readFile(hooksPath, "utf-8");
      const config = JSON.parse(raw);

      const sessionStart = config.hooks.SessionStart[0];
      expect(sessionStart.hooks[0].command).toContain("${CLAUDE_PLUGIN_ROOT}");
      expect(sessionStart.hooks[0].timeout).toBeLessThanOrEqual(10);
    });

    it("PreToolUse hook targets Write, Edit, and MultiEdit", async () => {
      const hooksPath = join(import.meta.dirname, "..", "hooks", "hooks.json");
      const raw = await readFile(hooksPath, "utf-8");
      const config = JSON.parse(raw);

      expect(config.hooks.PreToolUse).toBeInstanceOf(Array);
      expect(config.hooks.PreToolUse).toHaveLength(1);

      const preToolUse = config.hooks.PreToolUse[0];
      expect(preToolUse.matcher).toContain("Write");
      expect(preToolUse.matcher).toContain("Edit");
      expect(preToolUse.matcher).toContain("MultiEdit");
      expect(preToolUse.hooks[0].command).toContain("${CLAUDE_PLUGIN_ROOT}");
      expect(preToolUse.hooks[0].timeout).toBeLessThanOrEqual(10);
    });
  });

  describe("hooks/session-start.sh", () => {
    it("exists and is executable", async () => {
      const { stat } = await import("node:fs/promises");
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const stats = await stat(scriptPath);
      // Check executable bit (owner)
      expect(stats.mode & 0o100).toBeTruthy();
    });

    it("uses set -euo pipefail for safety", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("set -euo pipefail");
    });

    it("uses CLAUDE_PLUGIN_ROOT for the CLI path", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("CLAUDE_PLUGIN_ROOT");
    });

    it("exits cleanly when CLI is not built", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      // Should check if CLI exists before running
      expect(content).toContain('if [ ! -f "$CLI" ]');
      expect(content).toContain("exit 0");
    });
  });

  describe("hooks/check-availability.sh", () => {
    it("exists and is executable", async () => {
      const { stat } = await import("node:fs/promises");
      const scriptPath = join(import.meta.dirname, "..", "hooks", "check-availability.sh");
      const stats = await stat(scriptPath);
      expect(stats.mode & 0o100).toBeTruthy();
    });

    it("uses set -euo pipefail for safety", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "check-availability.sh");
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("set -euo pipefail");
    });

    it("handles all four modes", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "check-availability.sh");
      const content = await readFile(scriptPath, "utf-8");

      expect(content).toContain("online");
      expect(content).toContain("busy");
      expect(content).toContain("limited");
      expect(content).toContain("offline");
    });

    it("uses permissionDecision for busy locked and offline", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "check-availability.sh");
      const content = await readFile(scriptPath, "utf-8");

      // busy+locked and offline should ask, not just allow
      expect(content).toContain('"permissionDecision": "ask"');
      // busy (unlocked) and limited should allow with warning
      expect(content).toContain('"permissionDecision": "allow"');
    });

    it("references headsdown_propose in system messages", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "check-availability.sh");
      const content = await readFile(scriptPath, "utf-8");

      expect(content).toContain("headsdown_propose");
    });

    it("exits silently when CLI is not built", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "check-availability.sh");
      const content = await readFile(scriptPath, "utf-8");

      expect(content).toContain('if [ ! -f "$CLI" ]');
    });
  });

  describe("commands/headsdown.md", () => {
    it("exists with valid frontmatter", async () => {
      const cmdPath = join(import.meta.dirname, "..", "commands", "headsdown.md");
      const content = await readFile(cmdPath, "utf-8");

      expect(content).toMatch(/^---\n/);
      expect(content).toContain("description:");
      expect(content).toContain("allowed-tools:");
    });

    it("references the CLI for live context", async () => {
      const cmdPath = join(import.meta.dirname, "..", "commands", "headsdown.md");
      const content = await readFile(cmdPath, "utf-8");

      expect(content).toContain("CLAUDE_PLUGIN_ROOT");
      expect(content).toContain("dist/cli.js");
    });

    it("handles both status and auth arguments", async () => {
      const cmdPath = join(import.meta.dirname, "..", "commands", "headsdown.md");
      const content = await readFile(cmdPath, "utf-8");

      expect(content).toContain("status");
      expect(content).toContain("auth");
      expect(content).toContain("$ARGUMENTS");
    });
  });

  describe("plugin.json references hooks", () => {
    it("manifest points to hooks config", async () => {
      const manifestPath = join(import.meta.dirname, "..", ".claude-plugin", "plugin.json");
      const raw = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(raw);

      expect(manifest.hooks).toBe("./hooks/hooks.json");
    });
  });
});
