import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { HeadsDownClient } from "@headsdown/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

// Tests must not depend on whatever credentials exist on the local machine.
// Force the server to look for credentials in a temp path that does not exist.

let tempDir: string;
let continuationPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hd-claude-test-"));
  continuationPath = join(tempDir, "continuation.json");
  process.env.HEADSDOWN_CREDENTIALS_PATH = join(tempDir, "missing-credentials.json");
  process.env.HEADSDOWN_ACTION_MARKERS_PATH = join(tempDir, "markers.json");
  process.env.HEADSDOWN_CONTINUATION_PATH = continuationPath;
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env.HEADSDOWN_CREDENTIALS_PATH;
  delete process.env.HEADSDOWN_ACTION_MARKERS_PATH;
  delete process.env.HEADSDOWN_CONTINUATION_PATH;
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
    it("exposes ten tools", async () => {
      const client = await createTestClient();
      const result = await client.listTools();

      const names = result.tools.map((t) => t.name).sort();
      expect(names).toEqual([
        "headsdown_apply_action",
        "headsdown_auth",
        "headsdown_continuation",
        "headsdown_digest",
        "headsdown_grants",
        "headsdown_interrupt",
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

    it("propose delivery_mode accepts auto, wrap_up, and full_depth", async () => {
      const client = await createTestClient();
      const result = await client.listTools();
      const propose = result.tools.find((t) => t.name === "headsdown_propose");
      const deliveryMode = (
        propose?.inputSchema.properties as Record<string, { type: string; enum?: string[] }>
      ).delivery_mode;

      expect(deliveryMode.enum).toContain("auto");
      expect(deliveryMode.enum).toContain("wrap_up");
      expect(deliveryMode.enum).toContain("full_depth");
    });

    it("status tool output includes availability and wrapUpInstruction fields", async () => {
      const client = await createTestClient();
      const result = await client.listTools();
      const status = result.tools.find((t) => t.name === "headsdown_status");
      // Status has no required params but its description should mention availability
      expect(status?.description?.toLowerCase()).toContain("availability");
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

    it("interrupt tool has optional handle parameter", async () => {
      const client = await createTestClient();
      const result = await client.listTools();
      const interrupt = result.tools.find((t) => t.name === "headsdown_interrupt");

      expect(interrupt?.inputSchema.required).toEqual([]);
      const props = interrupt?.inputSchema.properties as Record<string, { type: string }>;
      expect(props.handle.type).toBe("string");
    });

    it("apply action tool requires run_id and action_key", async () => {
      const client = await createTestClient();
      const result = await client.listTools();
      const applyAction = result.tools.find((t) => t.name === "headsdown_apply_action");

      expect(applyAction?.inputSchema.required).toEqual(["run_id", "action_key"]);
      const props = applyAction?.inputSchema.properties as Record<string, { type: string }>;
      expect(props.run_id.type).toBe("string");
      expect(props.action_key.type).toBe("string");
      expect(props.duration_minutes.type).toBe("number");
      expect(props.handoff_summary.type).toBe("string");
      expect((props.handoff_summary as { description?: string }).description).toContain(
        "Required when action_key is queue_for_morning",
      );
    });

    it("continuation tool requires action parameter", async () => {
      const client = await createTestClient();
      const result = await client.listTools();
      const continuation = result.tools.find((t) => t.name === "headsdown_continuation");

      expect(continuation?.inputSchema.required).toEqual(["action"]);
      const props = continuation?.inputSchema.properties as Record<string, { type: string }>;
      expect(props.action.type).toBe("string");
      expect(props.branch.type).toBe("string");
      expect(props.resume_instruction.type).toBe("string");
    });
  });

  describe("headsdown_apply_action", () => {
    it("returns auth error when not authenticated", async () => {
      const client = await createTestClient();
      const result = await client.callTool({
        name: "headsdown_apply_action",
        arguments: { run_id: "run-1", action_key: "continue" },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Not authenticated");
      expect(result.isError).toBe(true);
    });

    it("queues for morning, saves a local handoff, and does not call availability overrides", async () => {
      const request = vi
        .fn()
        .mockResolvedValueOnce({
          agentControlOverview: {
            headsdownCall: { key: "off_the_clock" },
            runSummaries: [
              {
                runId: "run-queue",
                callKey: "off_the_clock",
                allowedActionKeys: ["queue_for_morning"],
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          applyHeadsdownAction: {
            ok: true,
            result: { eventId: "evt-queue", actionKey: "queue_for_morning" },
          },
        });

      const createAvailabilityOverride = vi.fn();
      const cancelAvailabilityOverride = vi.fn();
      const mockClient = {
        withActor: vi.fn().mockReturnThis(),
        graphql: { request },
        createAvailabilityOverride,
        cancelAvailabilityOverride,
      } as unknown as HeadsDownClient;

      vi.spyOn(HeadsDownClient, "fromCredentials").mockResolvedValue(mockClient);

      const client = await createTestClient();
      const result = await client.callTool({
        name: "headsdown_apply_action",
        arguments: {
          run_id: "run-queue",
          action_key: "queue_for_morning",
          handoff_summary: "Resume with one targeted validation.",
        },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      const payload = JSON.parse(text);
      expect(payload.ok).toBe(true);
      expect(payload.offClock.queuedForMorning).toBe(true);
      expect(payload.offClock.handoffSaved).toBe(true);
      expect(payload.offClock.message).toBe("Off the clock. Save the handoff and ask tomorrow.");

      const continuation = JSON.parse(await readFile(continuationPath, "utf-8"));
      expect(continuation.resumeInstruction).toBe("Resume with one targeted validation.");
      expect(continuation.runId).toBe("run-queue");

      expect(createAvailabilityOverride).not.toHaveBeenCalled();
      expect(cancelAvailabilityOverride).not.toHaveBeenCalled();
      expect(
        request.mock.calls.some((call) => String(call[0]).includes("createAvailabilityOverride")),
      ).toBe(false);
      expect(
        request.mock.calls.some((call) => String(call[0]).includes("cancelAvailabilityOverride")),
      ).toBe(false);
    });

    it("pauses and summarizes rabbit-hole runs with a saved handoff", async () => {
      const request = vi
        .fn()
        .mockResolvedValueOnce({
          agentControlOverview: {
            headsdownCall: { key: "rabbit_hole_detected" },
            runSummaries: [
              {
                runId: "run-rabbit",
                callKey: "rabbit_hole_detected",
                allowedActionKeys: ["pause_and_summarize", "allow_for_duration"],
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          applyHeadsdownAction: {
            ok: true,
            result: { eventId: "evt-rabbit", actionKey: "pause_and_summarize" },
          },
        });

      const mockClient = {
        withActor: vi.fn().mockReturnThis(),
        graphql: { request },
      } as unknown as HeadsDownClient;
      vi.spyOn(HeadsDownClient, "fromCredentials").mockResolvedValue(mockClient);

      const client = await createTestClient();
      const result = await client.callTool({
        name: "headsdown_apply_action",
        arguments: {
          run_id: "run-rabbit",
          action_key: "pause_and_summarize",
          handoff_summary: "Resume by re-scoping to the validation seam.",
        },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      const payload = JSON.parse(text);
      expect(payload.ok).toBe(true);
      expect(payload.rabbitHole).toEqual({
        pausedAndSummarized: true,
        handoffSaved: true,
        handoffSummary: "Resume by re-scoping to the validation seam.",
        message: "Rabbit hole detected. Pause before this becomes cleanup work.",
      });
      expect(payload.mutationInput).toMatchObject({
        runId: "run-rabbit",
        actionKey: "pause_and_summarize",
        sourceState: "rabbit_hole_detected",
        handoffAvailable: true,
        handoffState: "SAVED",
        handoffSource: "claude",
        handoffKind: "pause_summary",
      });
      expect(payload.mutationInput.handoffCapturedAt).toBeTruthy();

      const continuation = JSON.parse(await readFile(continuationPath, "utf-8"));
      expect(continuation.resumeInstruction).toBe("Resume by re-scoping to the validation seam.");
      expect(continuation.openDecisions).toEqual(["Re-scope before continuing."]);
      expect(continuation.runId).toBe("run-rabbit");
    });

    it("requires a handoff summary before queue_for_morning or pause_and_summarize reports a saved handoff", async () => {
      const mockClient = {
        withActor: vi.fn().mockReturnThis(),
        graphql: { request: vi.fn() },
      } as unknown as HeadsDownClient;
      vi.spyOn(HeadsDownClient, "fromCredentials").mockResolvedValue(mockClient);

      const client = await createTestClient();

      for (const actionKey of ["queue_for_morning", "pause_and_summarize"]) {
        const result = await client.callTool({
          name: "headsdown_apply_action",
          arguments: { run_id: `run-missing-summary-${actionKey}`, action_key: actionKey },
        });

        const text = (result.content as Array<{ type: string; text: string }>)[0].text;
        const payload = JSON.parse(text);
        expect(payload.ok).toBe(false);
        expect(payload.error.code).toBe("missing_required_input");
        expect(payload.error.details.field).toBe("handoff_summary");
        expect(payload.error.details.actionKey).toBe(actionKey);
        expect(result.isError).toBe(true);
      }

      await expect(access(continuationPath)).rejects.toBeTruthy();
    });

    it("removes the saved local handoff if the backend rejects a handoff action", async () => {
      for (const [actionKey, callKey] of [
        ["queue_for_morning", "off_the_clock"],
        ["pause_and_summarize", "rabbit_hole_detected"],
      ] as const) {
        const request = vi
          .fn()
          .mockResolvedValueOnce({
            agentControlOverview: {
              headsdownCall: { key: callKey },
              runSummaries: [
                {
                  runId: `run-rejected-${actionKey}`,
                  callKey,
                  allowedActionKeys: [actionKey],
                },
              ],
            },
          })
          .mockResolvedValueOnce({
            applyHeadsdownAction: {
              ok: false,
              error: { code: "invalid_transition", message: "not allowed", details: {} },
            },
          });

        const mockClient = {
          withActor: vi.fn().mockReturnThis(),
          graphql: { request },
        } as unknown as HeadsDownClient;
        vi.spyOn(HeadsDownClient, "fromCredentials").mockResolvedValue(mockClient);

        const client = await createTestClient();
        const result = await client.callTool({
          name: "headsdown_apply_action",
          arguments: {
            run_id: `run-rejected-${actionKey}`,
            action_key: actionKey,
            handoff_summary: "Resume from checkpoint.",
          },
        });

        expect(result.isError).toBe(true);
        await expect(access(continuationPath)).rejects.toBeTruthy();
      }
    });

    it("returns saved handoff after resume_run succeeds and consumes local continuation", async () => {
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir(dirname(continuationPath), { recursive: true });
      await writeFile(
        continuationPath,
        JSON.stringify({
          runId: "run-resume",
          pendingSteps: ["Resume from saved checkpoint"],
          resumeInstruction: "Resume from saved checkpoint",
        }),
      );

      const request = vi
        .fn()
        .mockResolvedValueOnce({
          agentControlOverview: {
            headsdownCall: { key: "ready_to_resume" },
            runSummaries: [
              {
                runId: "run-resume",
                callKey: "ready_to_resume",
                allowedActionKeys: ["resume_run"],
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          applyHeadsdownAction: {
            ok: true,
            result: { eventId: "evt-resume", actionKey: "resume_run" },
          },
        });

      const mockClient = {
        withActor: vi.fn().mockReturnThis(),
        graphql: { request },
      } as unknown as HeadsDownClient;
      vi.spyOn(HeadsDownClient, "fromCredentials").mockResolvedValue(mockClient);

      const client = await createTestClient();
      const result = await client.callTool({
        name: "headsdown_apply_action",
        arguments: { run_id: "run-resume", action_key: "resume_run" },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      const payload = JSON.parse(text);
      expect(payload.ok).toBe(true);
      expect(payload.offClock.resumed).toBe(true);
      expect(payload.offClock.handoff.resumeInstruction).toBe("Resume from saved checkpoint");
      await expect(access(continuationPath)).rejects.toBeTruthy();
    });
  });

  describe("headsdown_interrupt", () => {
    it("returns auth error when not authenticated", async () => {
      const client = await createTestClient();
      const result = await client.callTool({ name: "headsdown_interrupt", arguments: {} });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Not authenticated");
      expect(result.isError).toBe(true);
    });

    it("returns auth error with optional handle parameter", async () => {
      const client = await createTestClient();
      const result = await client.callTool({
        name: "headsdown_interrupt",
        arguments: { handle: "clarifying_question" },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("Not authenticated");
      expect(result.isError).toBe(true);
    });

    it("suppresses interrupts while queue_for_morning is active", async () => {
      const request = vi
        .fn()
        .mockResolvedValueOnce({
          agentControlOverview: {
            headsdownCall: { key: "off_the_clock" },
            runSummaries: [
              {
                runId: "run-quiet",
                callKey: "off_the_clock",
                allowedActionKeys: ["queue_for_morning"],
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          applyHeadsdownAction: {
            ok: true,
            result: { eventId: "evt-quiet", actionKey: "queue_for_morning" },
          },
        });

      const evaluateInterrupt = vi.fn().mockResolvedValue({ allowed: true, reason: "ok" });
      const mockClient = {
        withActor: vi.fn().mockReturnThis(),
        graphql: { request },
        evaluateInterrupt,
      } as unknown as HeadsDownClient;
      vi.spyOn(HeadsDownClient, "fromCredentials").mockResolvedValue(mockClient);

      const client = await createTestClient();
      await client.callTool({
        name: "headsdown_apply_action",
        arguments: {
          run_id: "run-quiet",
          action_key: "queue_for_morning",
          handoff_summary: "Ask tomorrow with this checkpoint.",
        },
      });

      const interruptResult = await client.callTool({
        name: "headsdown_interrupt",
        arguments: { handle: "clarifying_question" },
      });

      const text = (interruptResult.content as Array<{ type: string; text: string }>)[0].text;
      const payload = JSON.parse(text);
      expect(payload.allowed).toBe(false);
      expect(payload.reason).toBe("off_the_clock_queued_for_morning");
      expect(payload.autoResponse).toBe("Off the clock. Save the handoff and ask tomorrow.");
      expect(payload.guidance).toContain(
        "Claude Code controls the model. HeadsDown controls the run.",
      );
      expect(evaluateInterrupt).not.toHaveBeenCalled();
    });
  });

  describe("headsdown_continuation", () => {
    it("returns error for invalid action", async () => {
      const client = await createTestClient();
      const result = await client.callTool({
        name: "headsdown_continuation",
        arguments: { action: "invalid" },
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("action");
      expect(result.isError).toBe(true);
    });

    it("returns error for missing action", async () => {
      const client = await createTestClient();
      const result = await client.callTool({
        name: "headsdown_continuation",
        arguments: {},
      });

      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain("action");
      expect(result.isError).toBe(true);
    });

    it("load returns found:false when no continuation artifact exists", async () => {
      // Temporarily rename any real continuation file so this test is isolated
      const { rename, stat } = await import("node:fs/promises");
      const { homedir } = await import("node:os");
      const realPath = join(homedir(), ".config", "headsdown", "continuation.json");
      const backupPath = join(homedir(), ".config", "headsdown", "continuation.json.test-bak");

      let hadRealFile = false;
      try {
        await stat(realPath);
        await rename(realPath, backupPath);
        hadRealFile = true;
      } catch {
        // File didn't exist — nothing to move
      }

      try {
        const client = await createTestClient();
        const result = await client.callTool({
          name: "headsdown_continuation",
          arguments: { action: "load" },
        });

        const text = (result.content as Array<{ type: string; text: string }>)[0].text;
        const parsed = JSON.parse(text);
        expect(parsed.found).toBe(false);
        expect(result.isError).toBeFalsy();
      } finally {
        if (hadRealFile) {
          await rename(backupPath, realPath);
        }
      }
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
      expect(content).toContain("headsdown_apply_action");
      expect(content).toContain("headsdown_auth");
    });

    it("documents rabbit-hole run governance framing", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("Rabbit hole detected. Pause before this becomes cleanup work.");
      expect(content).toContain("Claude Code controls the model. HeadsDown controls the run.");
      expect(content).toContain("pause_and_summarize");
      expect(content).toContain("allow_for_duration");
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

    it("documents schedule/cron availability awareness", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("schedule");
      expect(content).toContain("online");
      // Should warn about scheduling during busy/offline
      expect(content).toContain("busy");
    });

    it("documents mid-task scope escalation", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("scope");
      expect(content).toContain("re-propose");
      expect(content).toContain("estimated_files");
    });

    it("documents wrap-up handoff notes", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("wrap_up");
      expect(content).toContain("Completed:");
      expect(content).toContain("Deferred:");
      expect(content).toContain("Pick up here:");
    });

    it("documents digest follow-up proposal pipeline", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("follow-up");
      expect(content).toContain("actionable");
    });

    it("documents proactive session-end outcome reporting", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("session is ending");
      expect(content).toContain("headsdown_report");
    });

    it("documents subagent delegation grant verification", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("subagent");
      expect(content).toContain("list_active");
      expect(content).toContain("headsdown_grants");
    });

    it("documents commit strategy by execution policy", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("Commit Strategy");
      expect(content).toContain("wrap_up");
      expect(content).toContain("full_depth");
    });

    it("documents smart digest triage by current-work relevance", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("cross-reference");
      expect(content).toContain("current working context");
    });

    it("documents time-aware task planning", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("Time-Aware Task Planning");
      expect(content).toContain("remainingMinutes");
      expect(content).toContain("estimated_minutes");
      expect(content).toContain("Decompose");
    });

    it("documents full-depth delivery_mode override", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("delivery_mode");
      expect(content).toContain("full_depth");
      expect(content).toContain("wrap_up");
    });

    it("documents the two-axis availability model", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("Two-Axis");
      expect(content).toContain("Axis 1");
      expect(content).toContain("Axis 2");
      expect(content).toContain("executionDirective");
    });

    it("documents execution directive codes", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("proceed_with_caution");
      expect(content).toContain("proceed");
      expect(content).toContain("defer");
    });

    it("documents hard limits from execution directive", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("hardLimits");
      expect(content).toContain("avoidNewRefactors");
    });

    it("documents interrupt evaluation guidance", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("headsdown_interrupt");
      expect(content).toContain("autoResponse");
      expect(content).toContain("allowed");
    });

    it("documents Stop hook auto-reporting behavior", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("Stop hook");
      expect(content).toContain("partially_completed");
    });

    it("references headsdown_continuation in the tool list", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("headsdown_continuation");
    });

    it("documents session resume guidance", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("Session Resume");
      expect(content).toContain("action: load");
    });

    it("documents continuation save in wrap-up handoff notes", async () => {
      const skillPath = join(import.meta.dirname, "..", "skills", "headsdown", "SKILL.md");
      const content = await readFile(skillPath, "utf-8");

      expect(content).toContain("action: save");
      expect(content).toContain("pending_steps");
      expect(content).toContain("resume_instruction");
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

    it("PostToolUse hook observes all tools for progress reporting", async () => {
      const hooksPath = join(import.meta.dirname, "..", "hooks", "hooks.json");
      const raw = await readFile(hooksPath, "utf-8");
      const config = JSON.parse(raw);

      expect(config.hooks.PostToolUse).toBeInstanceOf(Array);
      expect(config.hooks.PostToolUse).toHaveLength(1);

      const postToolUse = config.hooks.PostToolUse[0];
      expect(postToolUse.matcher).toBe("*");
      expect(postToolUse.hooks[0].command).toContain("${CLAUDE_PLUGIN_ROOT}");
      expect(postToolUse.hooks[0].timeout).toBeLessThanOrEqual(10);
    });

    it("PreCompact hook uses wildcard matcher and CLAUDE_PLUGIN_ROOT", async () => {
      const hooksPath = join(import.meta.dirname, "..", "hooks", "hooks.json");
      const raw = await readFile(hooksPath, "utf-8");
      const config = JSON.parse(raw);

      expect(config.hooks.PreCompact).toBeInstanceOf(Array);
      expect(config.hooks.PreCompact).toHaveLength(1);

      const preCompact = config.hooks.PreCompact[0];
      expect(preCompact.matcher).toBe("*");
      expect(preCompact.hooks[0].command).toContain("${CLAUDE_PLUGIN_ROOT}");
      expect(preCompact.hooks[0].timeout).toBeLessThanOrEqual(10);
    });

    it("Stop hook triggers session-end.sh on all matchers", async () => {
      const hooksPath = join(import.meta.dirname, "..", "hooks", "hooks.json");
      const raw = await readFile(hooksPath, "utf-8");
      const config = JSON.parse(raw);

      expect(config.hooks.Stop).toBeInstanceOf(Array);
      expect(config.hooks.Stop).toHaveLength(1);

      const stop = config.hooks.Stop[0];
      expect(stop.matcher).toBe("*");
      expect(stop.hooks[0].command).toContain("${CLAUDE_PLUGIN_ROOT}");
      expect(stop.hooks[0].command).toContain("session-end.sh");
      expect(stop.hooks[0].timeout).toBeLessThanOrEqual(10);
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

    it("propagates wrap-up instruction into session context", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("wrap_up_instruction");
      expect(content).toContain("Execution guidance:");
    });

    it("injects upcoming window transition warning when within 60 minutes", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("next-window");
      expect(content).toContain("minutes_until");
      expect(content).toContain("Transition in");
    });

    it("includes wrap-up threshold in transition warning", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("wrap_threshold");
      expect(content).toContain("Wrap-up threshold is");
    });

    it("injects remaining attention budget in minutes", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("remaining_minutes");
      expect(content).toContain("Remaining attention budget:");
    });

    it("exits cleanly when CLI is not built", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      // Should check if CLI exists before running
      expect(content).toContain('if [ ! -f "$CLI" ]');
      expect(content).toContain("exit 0");
    });

    it("checks for a queued action marker before digest count", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("action-marker active");
      expect(content).toContain("attemptByAction.queue_for_morning");
      expect(content).toContain("Queued run");
      expect(content).toContain("until HeadsDown returns resume_run");
    });

    it("checks for a continuation artifact after digest count", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("continuation check");
      expect(content).toContain("continuation.json");
    });

    it("injects [Continuation] message when artifact exists", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("[Continuation]");
      expect(content).toContain("resumeInstruction");
    });

    it("instructs Claude to call headsdown_continuation to load artifact", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("headsdown_continuation");
      expect(content).toContain("action");
      expect(content).toContain("load");
    });

    it("injects both availability mode and execution directive axes", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("execution_directive_code");
      expect(content).toContain("Axis 1");
      expect(content).toContain("Axis 2");
    });

    it("injects rendered HeadsDown call text before supporting availability context", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("renderedHeadsDownCall.text");
      expect(content).toContain("headsdown_call_text");
      expect(content).toContain("Supporting availability context");
    });

    it("escapes session-start system message as compact JSON via jq", async () => {
      const scriptPath = join(import.meta.dirname, "..", "hooks", "session-start.sh");
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("jq -nc --arg systemMessage");
      expect(content).toContain("{systemMessage: $systemMessage}");
    });
  });

  describe("hooks/session-end.sh", () => {
    const scriptPath = join(import.meta.dirname, "..", "hooks", "session-end.sh");

    it("exists and is executable", async () => {
      const { stat } = await import("node:fs/promises");
      const stats = await stat(scriptPath);
      expect(stats.mode & 0o100).toBeTruthy();
    });

    it("uses set -euo pipefail for safety", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("set -euo pipefail");
    });

    it("uses CLAUDE_PLUGIN_ROOT for the CLI path", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("CLAUDE_PLUGIN_ROOT");
    });

    it("exits cleanly when CLI is not built", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain('if [ ! -f "$CLI" ]');
      expect(content).toContain("exit 0");
    });

    it("calls the CLI report command", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain('"$CLI" report');
    });

    it("fails open when report command errors", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("|| exit 0");
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

    it("denies writes while a queued action marker is active", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("action-marker active");
      expect(content).toContain("attemptByAction.queue_for_morning");
      expect(content).toContain('"permissionDecision": "deny"');
      expect(content).toContain(
        "Do not continue, modify files, or ask again until HeadsDown returns resume_run",
      );
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
      expect(content).toContain("Execution policy for this task");
    });

    it("status handler returns wrapUpInstruction and rendered HeadsDown call in JSON output", async () => {
      const serverPath = join(import.meta.dirname, "..", "src", "server.ts");
      const content = await readFile(serverPath, "utf-8");
      // handleStatus should include wrapUpInstruction in its JSON output
      expect(content).toContain("wrapUpInstruction");
      // availability object is returned which carries wrapUpGuidance
      expect(content).toContain("availability");
      expect(content).toContain("renderedHeadsDownCall");
      expect(content).toContain("renderHeadsDownCall");
    });

    it("uses privacy-safe unknown workspaceRef in actor context", async () => {
      const serverPath = join(import.meta.dirname, "..", "src", "server.ts");
      const cliPath = join(import.meta.dirname, "..", "src", "cli.ts");
      const serverContent = await readFile(serverPath, "utf-8");
      const cliContent = await readFile(cliPath, "utf-8");
      expect(serverContent).toContain('workspaceRef: "unknown"');
      expect(cliContent).toContain('workspaceRef: "unknown"');
    });

    it("propose handler forwards delivery_mode to SDK", async () => {
      const serverPath = join(import.meta.dirname, "..", "src", "server.ts");
      const content = await readFile(serverPath, "utf-8");
      expect(content).toContain("parseDeliveryMode");
      expect(content).toContain("deliveryMode");
    });

    it("status handler exposes two-axis model with mode and executionDirective", async () => {
      const serverPath = join(import.meta.dirname, "..", "src", "server.ts");
      const content = await readFile(serverPath, "utf-8");
      expect(content).toContain("executionDirective");
      expect(content).toContain("Axis 1");
      expect(content).toContain("Axis 2");
      expect(content).toContain("hardLimits");
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

  describe("hooks/pre-compact.sh", () => {
    const scriptPath = join(import.meta.dirname, "..", "hooks", "pre-compact.sh");

    it("exists and is executable", async () => {
      const { stat } = await import("node:fs/promises");
      const stats = await stat(scriptPath);
      expect(stats.mode & 0o100).toBeTruthy();
    });

    it("uses set -euo pipefail for safety", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("set -euo pipefail");
    });

    it("exits cleanly when CLI is not built", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain('if [ ! -f "$CLI" ]');
      expect(content).toContain("exit 0");
    });

    it("reads proposal state and wrap-up instruction", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("proposals");
      expect(content).toContain("wrapUpInstruction");
      expect(content).toContain("wrap_up_instruction");
    });

    it("exits silently when no proposal and no wrap-up instruction", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("exit 0");
      // The silent exit should come after checking both are empty
      expect(content).toContain('[ -z "$proposal_desc" ] && [ -z "$wrap_up_instruction" ]');
    });

    it("injects proposal description into system message", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("approved proposal");
      expect(content).toContain("proposal_desc");
    });

    it("includes estimated files count when present", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("estimated_files");
      expect(content).toContain("estimated");
    });

    it("instructs Claude to include context in compaction summary", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("compaction summary");
    });

    it("uses [HeadsDown] prefix in system messages", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("[HeadsDown]");
    });
  });

  describe("hooks/post-tool-use.sh", () => {
    const scriptPath = join(import.meta.dirname, "..", "hooks", "post-tool-use.sh");

    it("exists and is executable", async () => {
      const { stat } = await import("node:fs/promises");
      const stats = await stat(scriptPath);
      expect(stats.mode & 0o100).toBeTruthy();
    });

    it("uses set -euo pipefail for safety", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("set -euo pipefail");
    });

    it("exits cleanly when CLI is not built", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain('if [ ! -f "$CLI" ]');
      expect(content).toContain("exit 0");
    });

    it("uses CLAUDE_SESSION_ID for the counter file", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("CLAUDE_SESSION_ID");
      expect(content).toContain("COUNTER_FILE");
      expect(content).toContain("/tmp/headsdown-file-count-");
    });

    it("falls back to 'default' when CLAUDE_SESSION_ID is unset", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("CLAUDE_SESSION_ID:-default");
    });

    it("increments counter and reports running count", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("count=$((current + 1))");
      expect(content).toContain("modified this session");
    });

    it("checks proposal estimatedFiles for scope comparison", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("estimatedFiles");
      expect(content).toContain("estimated_files");
    });

    it("warns when file count exceeds estimate by more than 50%", async () => {
      const content = await readFile(scriptPath, "utf-8");
      // 50% threshold: estimated * 3 / 2
      expect(content).toContain("estimated_files * 3 / 2");
      expect(content).toContain("Scope warning");
      expect(content).toContain("headsdown_propose");
    });

    it("skips scope warning when no estimatedFiles in proposal", async () => {
      const content = await readFile(scriptPath, "utf-8");
      // Guard ensures we only compare when estimated_files > 0
      expect(content).toContain('[ "$estimated_files" -gt 0 ]');
    });

    it("reports progress in fail-open mode", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain('node "$CLI" report-progress "$TOOL_TYPE" "$count"');
      expect(content).toContain('|| progress_json=""');
    });

    it("surfaces rabbit-hole intervention copy with run-governance framing", async () => {
      const content = await readFile(scriptPath, "utf-8");

      expect(content).toContain("rabbitHoleDetected");
      expect(content).toContain("Rabbit hole detected. Pause before this becomes cleanup work.");
      expect(content).toContain("Claude Code controls the model. HeadsDown controls the run.");
      expect(content).toContain("headsdown_apply_action");
      expect(content).toContain("run_id");
      expect(content).toContain("pause_and_summarize");
      expect(content).toContain("handoff_summary");
      expect(content).toContain("allow_for_duration");
      expect(content).toContain("Do not call allow_for_duration after pause_and_summarize");
      expect(content).toContain("check headsdown_status to re-establish the target run");
    });

    it("builds rabbit-hole state from active run summaries", async () => {
      const cliPath = join(import.meta.dirname, "..", "src", "cli.ts");
      const content = await readFile(cliPath, "utf-8");

      expect(content).toContain("buildReportProgressResponse");
      expect(content).toContain("activeRun");
      expect(content).toContain("overview");
    });

    it("uses [HeadsDown] prefix in system messages", async () => {
      const content = await readFile(scriptPath, "utf-8");
      expect(content).toContain("[HeadsDown]");
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
