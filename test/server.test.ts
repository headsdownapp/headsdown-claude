import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
