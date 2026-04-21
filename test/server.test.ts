import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

// Tests must not depend on whatever credentials exist on the local machine.
// Force the server to look for credentials in a temp path that does not exist.

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hd-claude-test-"));
  process.env.HEADSDOWN_CREDENTIALS_PATH = join(tempDir, "missing-credentials.json");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env.HEADSDOWN_CREDENTIALS_PATH;
  vi.restoreAllMocks();
});

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
    it("exposes seven tools", async () => {
      const client = await createTestClient();
      const result = await client.listTools();

      const names = result.tools.map((t) => t.name).sort();
      expect(names).toEqual([
        "headsdown_auth",
        "headsdown_digest",
        "headsdown_grants",
        "headsdown_override",
        "headsdown_propose",
        "headsdown_report",
        "headsdown_status",
      ]);
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

  describe("headsdown_digest", () => {
    it("returns auth error when not authenticated", async () => {
      const client = await createTestClient();
      const result = await client.callTool({ name: "headsdown_digest", arguments: {} });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Not authenticated");
      expect(result.isError).toBe(true);
    });
  });

  describe("headsdown_grants", () => {
    it("returns auth error when not authenticated", async () => {
      const client = await createTestClient();
      const result = await client.callTool({ name: "headsdown_grants", arguments: {} });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Not authenticated");
      expect(result.isError).toBe(true);
    });
  });

  describe("headsdown_override", () => {
    it("returns auth error when not authenticated", async () => {
      const client = await createTestClient();
      const result = await client.callTool({ name: "headsdown_override", arguments: {} });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Not authenticated");
      expect(result.isError).toBe(true);
    });
  });

  describe("headsdown_report", () => {
    it("returns error for missing outcome", async () => {
      const client = await createTestClient();
      const result = await client.callTool({ name: "headsdown_report", arguments: {} });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("outcome");
      expect(result.isError).toBe(true);
    });

    it("returns error for invalid outcome value", async () => {
      const client = await createTestClient();
      const result = await client.callTool({
        name: "headsdown_report",
        arguments: { outcome: "invalid_value" },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Invalid outcome");
      expect(result.isError).toBe(true);
    });

    it("returns error when no active calibration session", async () => {
      const client = await createTestClient();
      const result = await client.callTool({
        name: "headsdown_report",
        arguments: { outcome: "completed" },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("No active calibration session");
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
      expect(props.delivery_mode.type).toBe("string");
    });

    it("digest tool has optional latest parameter", async () => {
      const client = await createTestClient();
      const result = await client.listTools();
      const digest = result.tools.find((t) => t.name === "headsdown_digest");
      const props = digest?.inputSchema.properties as Record<string, { type: string }>;

      expect(props.latest.type).toBe("number");
      expect(digest?.inputSchema.required).toEqual([]);
    });

    it("report tool requires outcome", async () => {
      const client = await createTestClient();
      const result = await client.listTools();
      const report = result.tools.find((t) => t.name === "headsdown_report");

      expect(report?.inputSchema.required).toEqual(["outcome"]);
    });

    it("grants tool has action parameter", async () => {
      const client = await createTestClient();
      const result = await client.listTools();
      const grants = result.tools.find((t) => t.name === "headsdown_grants");
      const props = grants?.inputSchema.properties as Record<string, { type: string }>;

      expect(props.action.type).toBe("string");
      expect(grants?.inputSchema.required).toEqual([]);
    });

    it("override tool has action and mode parameters", async () => {
      const client = await createTestClient();
      const result = await client.listTools();
      const override = result.tools.find((t) => t.name === "headsdown_override");
      const props = override?.inputSchema.properties as Record<string, { type: string }>;

      expect(props.action.type).toBe("string");
      expect(props.mode.type).toBe("string");
      expect(override?.inputSchema.required).toEqual([]);
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
      expect(content).toContain("headsdown_digest");
      expect(content).toContain("headsdown_report");
      expect(content).toContain("headsdown_grants");
      expect(content).toContain("headsdown_override");
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
    const scriptPath = join(import.meta.dirname, "..", "hooks", "check-availability.sh");

    it("exists and is executable", async () => {
      const { stat } = await import("node:fs/promises");
      const stats = await stat(scriptPath);
      expect(stats.mode & 0o100).toBeTruthy();
    });

    it("uses set -euo pipefail for safety", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("set -euo pipefail");
    });

    it("handles all four availability modes", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("online");
      expect(content).toContain("busy");
      expect(content).toContain("limited");
      expect(content).toContain("offline");
    });

    it("implements all three trust levels", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("advisory");
      expect(content).toContain("active");
      expect(content).toContain("guarded");
    });

    it("advisory mode never returns permissionDecision allow", async () => {
      const content = await readFile(scriptPath, "utf-8");
      // Extract the advisory case block
      const advisoryBlock = content.match(/advisory\)[\s\S]*?;;\s*\n\s*active/)?.[0] ?? "";
      expect(advisoryBlock).not.toContain('"permissionDecision": "allow"');
      // But it should have ask for locked/offline
      expect(advisoryBlock).toContain('"permissionDecision": "ask"');
    });

    it("active mode returns allow when proposal exists", async () => {
      const content = await readFile(scriptPath, "utf-8");
      const activeBlock = content.match(/active\)[\s\S]*?;;\s*\n\s*guarded/)?.[0] ?? "";
      expect(activeBlock).toContain('"permissionDecision": "allow"');
      expect(activeBlock).toContain("Auto-approved");
    });

    it("guarded mode requires proposal for busy/limited", async () => {
      const content = await readFile(scriptPath, "utf-8");
      const guardedBlock = content.match(/guarded\)[\s\S]*?;;\s*\n\s*\*\)/)?.[0] ?? "";
      expect(guardedBlock).toContain('"permissionDecision": "ask"');
      expect(guardedBlock).toContain("No approved proposal");
    });

    it("checks sensitive paths before mode logic", async () => {
      const content = await readFile(scriptPath, "utf-8");
      // Sensitive path check should come before the trust level case statement
      const sensitiveIdx = content.indexOf("Sensitive file detected");
      const trustIdx = content.indexOf('case "$trust_level"');
      expect(sensitiveIdx).toBeLessThan(trustIdx);
      expect(content).toContain('"permissionDecision": "ask"');
    });

    it("reads tool input file path from stdin", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("tool_input");
      expect(content).toContain("file_path");
    });

    it("references headsdown_propose in system messages", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("headsdown_propose");
    });

    it("mentions wrap-up guidance in status formatting", async () => {
      const serverPath = join(import.meta.dirname, "..", "src", "server.ts");
      const content = await readFile(serverPath, "utf-8");
      expect(content).toContain("Wrap-Up guidance");
      expect(content).toContain("wrapUpGuidance");
    });

    it("exits silently when CLI is not built", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain('if [ ! -f "$CLI" ]');
    });

    it("all system messages use [HeadsDown] prefix", async () => {
      const content = await readFile(scriptPath, "utf-8");
      const systemMessages = content.match(/"systemMessage":\s*"[^"]+"/g) ?? [];
      for (const msg of systemMessages) {
        expect(msg).toContain("[HeadsDown]");
      }
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
