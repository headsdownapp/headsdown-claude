import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyCanonicalAction,
  LocalActionMarkerStore,
  type ApplyActionInput,
} from "../src/headsdown-action-executor.js";

async function withStore<T>(fn: (store: LocalActionMarkerStore) => Promise<T>) {
  const dir = await mkdtemp(join(tmpdir(), "headsdown-action-test-"));
  const path = join(dir, "markers.json");
  const store = new LocalActionMarkerStore(path);

  try {
    return await fn(store);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function deps(
  store: LocalActionMarkerStore,
  options?: {
    allowedActionKeys?: string[];
    runActionContext?: { sourceState?: string | null; allowedActionKeys?: string[] | null } | null;
    mutate?: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    now?: () => Date;
  },
) {
  return {
    markerStore: store,
    now: options?.now ?? (() => new Date("2026-04-25T12:00:00.000Z")),
    getRunActionContext: async () =>
      options && "runActionContext" in options
        ? (options.runActionContext ?? null)
        : {
            sourceState: "needs_your_yes",
            allowedActionKeys: options?.allowedActionKeys ?? ["continue", "queue_for_morning"],
          },
    mutateAction:
      options?.mutate ??
      (async (input) => ({
        applyHeadsdownAction: {
          ok: true,
          result: { eventId: "evt-1", replayed: false },
          runSummary: { runId: input.runId },
        },
      })),
  };
}

describe("applyCanonicalAction", () => {
  it("maps a supported canonical action to backend mutation input", async () => {
    await withStore(async (store) => {
      const captured: Array<Record<string, unknown>> = [];

      const result = await applyCanonicalAction(
        {
          runId: "run-1",
          actionKey: "continue",
        },
        deps(store, {
          allowedActionKeys: ["continue"],
          mutate: async (input) => {
            captured.push(input);
            return {
              applyHeadsdownAction: {
                ok: true,
                result: { eventId: "evt-continue", replayed: false },
              },
            };
          },
        }),
      );

      expect(result.ok).toBe(true);
      expect(captured).toHaveLength(1);
      expect(captured[0].actionKey).toBe("continue");
      expect(captured[0].runId).toBe("run-1");
      expect(captured[0].client).toBe("claude-code");
      expect(captured[0].source).toBe("claude_code_mcp");
    });
  });

  it("supports every required canonical action or returns an explicit unsupported result", async () => {
    await withStore(async (store) => {
      const actionKeys = [
        "continue",
        "continue_with_limit",
        "narrow_scope",
        "ask_user",
        "queue_for_later",
        "queue_for_morning",
        "pause_and_summarize",
        "stop_run",
        "resume_run",
        "allow_once",
        "allow_for_duration",
        "keep_queued",
        "create_temporary_exception",
      ];

      for (const actionKey of actionKeys) {
        const result = await applyCanonicalAction(
          {
            runId: `run-${actionKey}`,
            actionKey,
            durationMinutes: actionKey === "allow_for_duration" ? 15 : undefined,
          },
          deps(store, { allowedActionKeys: actionKeys }),
        );

        if (actionKey === "create_temporary_exception") {
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error.code).toBe("unsupported_action");
        } else {
          expect(result.ok).toBe(true);
        }
      }
    });
  });

  it("returns unsupported_action for canonical actions not implemented locally", async () => {
    await withStore(async (store) => {
      const result = await applyCanonicalAction(
        {
          runId: "run-1",
          actionKey: "create_temporary_exception",
        },
        deps(store, { allowedActionKeys: ["create_temporary_exception"] }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("unsupported_action");
      }
    });
  });

  it("allows continue_with_limit without a client-invented duration", async () => {
    await withStore(async (store) => {
      const result = await applyCanonicalAction(
        {
          runId: "run-1",
          actionKey: "continue_with_limit",
        },
        deps(store, { allowedActionKeys: ["continue_with_limit"] }),
      );

      expect(result.ok).toBe(true);
    });
  });

  it("returns missing_required_input when duration is missing", async () => {
    await withStore(async (store) => {
      const result = await applyCanonicalAction(
        {
          runId: "run-1",
          actionKey: "allow_for_duration",
        },
        deps(store, { allowedActionKeys: ["allow_for_duration"] }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("missing_required_input");
        expect(result.error.details.field).toBe("duration_minutes");
      }
    });
  });

  it("uses target run context instead of caller-supplied sourceState", async () => {
    await withStore(async (store) => {
      const captured: Array<Record<string, unknown>> = [];

      const result = await applyCanonicalAction(
        { runId: "run-target-context", actionKey: "continue", sourceState: "off_the_clock" },
        deps(store, {
          runActionContext: { sourceState: "needs_your_yes", allowedActionKeys: ["continue"] },
          mutate: async (input) => {
            captured.push(input);
            return { applyHeadsdownAction: { ok: true, result: { eventId: "evt-1" } } };
          },
        }),
      );

      expect(result.ok).toBe(true);
      expect(captured[0].sourceState).toBe("needs_your_yes");
    });
  });

  it("does not auto-fill sourceState when no target run context is available", async () => {
    await withStore(async (store) => {
      const captured: Array<Record<string, unknown>> = [];

      const result = await applyCanonicalAction(
        { runId: "run-no-context", actionKey: "continue" },
        deps(store, {
          runActionContext: null,
          mutate: async (input) => {
            captured.push(input);
            return { applyHeadsdownAction: { ok: true, result: { eventId: "evt-1" } } };
          },
        }),
      );

      expect(result.ok).toBe(true);
      expect(captured[0].sourceState).toBeUndefined();
    });
  });

  it("blocks when target run context has an explicit empty allowed-action list", async () => {
    await withStore(async (store) => {
      const result = await applyCanonicalAction(
        { runId: "run-empty-actions", actionKey: "continue" },
        deps(store, { runActionContext: { sourceState: "keep_it_tight", allowedActionKeys: [] } }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("not_allowed");
        expect(result.error.details.allowedActionKeys).toEqual([]);
      }
    });
  });

  it("returns not_allowed when action is outside target run allowedActionKeys", async () => {
    await withStore(async (store) => {
      const result = await applyCanonicalAction(
        {
          runId: "run-1",
          actionKey: "stop_run",
        },
        deps(store, { allowedActionKeys: ["continue"] }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("not_allowed");
        expect(result.error.details.allowedActionKeys).toEqual(["continue"]);
        expect(result.error.details.sourceState).toBe("needs_your_yes");
      }
    });
  });

  it("does not claim a saved handoff when queueing without a captured handoff", async () => {
    await withStore(async (store) => {
      const result = await applyCanonicalAction(
        { runId: "run-unknown-handoff", actionKey: "queue_for_morning" },
        deps(store, { allowedActionKeys: ["queue_for_morning"] }),
      );

      expect(result.ok).toBe(true);
      const marker = await store.get("run-unknown-handoff");
      expect(marker?.handoffAvailable).toBe(false);
      expect(marker?.handoffState).toBe("unknown");
      if (result.ok) {
        expect(result.mutationInput.handoffAvailable).toBe(false);
        expect(result.mutationInput.handoffState).toBe("UNKNOWN");
        expect(result.mutationInput.handoffCapturedAt).toBeUndefined();
      }
    });
  });

  it("marks queue_for_later as queued until resume_run", async () => {
    await withStore(async (store) => {
      const result = await applyCanonicalAction(
        { runId: "run-later", actionKey: "queue_for_later" },
        deps(store, { allowedActionKeys: ["queue_for_later"] }),
      );

      expect(result.ok).toBe(true);
      const marker = await store.get("run-later");
      expect(marker?.handoffKind).toBe("queue_for_later");
      if (result.ok) {
        expect(result.mutationInput.handoffKind).toBe("queue_for_later");
        expect(result.mutationInput.handoffState).toBe("UNKNOWN");
      }
    });
  });

  it("does not claim a saved handoff when pausing without a captured handoff", async () => {
    await withStore(async (store) => {
      const result = await applyCanonicalAction(
        { runId: "run-unknown-pause", actionKey: "pause_and_summarize" },
        deps(store, { allowedActionKeys: ["pause_and_summarize"] }),
      );

      expect(result.ok).toBe(true);
      const marker = await store.get("run-unknown-pause");
      expect(marker?.handoffAvailable).toBe(false);
      expect(marker?.handoffState).toBe("unknown");
      if (result.ok) {
        expect(result.mutationInput.handoffAvailable).toBe(false);
        expect(result.mutationInput.handoffState).toBe("UNKNOWN");
        expect(result.mutationInput.handoffCapturedAt).toBeUndefined();
      }
    });
  });

  it("stores queue marker metadata and keeps it for keep_queued, then clears on resume_run", async () => {
    await withStore(async (store) => {
      const input: ApplyActionInput = {
        runId: "run-queue",
        actionKey: "queue_for_morning",
        handoffAvailable: true,
        handoffState: "saved",
        handoffCapturedAt: "2026-04-25T12:00:00.000Z",
      };

      const queued = await applyCanonicalAction(
        input,
        deps(store, { allowedActionKeys: ["queue_for_morning", "keep_queued", "resume_run"] }),
      );
      expect(queued.ok).toBe(true);

      const markerAfterQueue = await store.get("run-queue");
      expect(markerAfterQueue?.handoffAvailable).toBe(true);
      expect(markerAfterQueue?.handoffState).toBe("saved");
      expect(markerAfterQueue?.handoffSource).toBe("claude");
      if (queued.ok) expect(queued.mutationInput.handoffState).toBe("SAVED");

      const keepQueued = await applyCanonicalAction(
        { runId: "run-queue", actionKey: "keep_queued" },
        deps(store, { allowedActionKeys: ["queue_for_morning", "keep_queued", "resume_run"] }),
      );
      expect(keepQueued.ok).toBe(true);

      const markerAfterKeep = await store.get("run-queue");
      expect(markerAfterKeep?.handoffAvailable).toBe(true);

      const resumed = await applyCanonicalAction(
        { runId: "run-queue", actionKey: "resume_run" },
        deps(store, { allowedActionKeys: ["queue_for_morning", "keep_queued", "resume_run"] }),
      );
      expect(resumed.ok).toBe(true);

      const markerAfterResume = await store.get("run-queue");
      expect(markerAfterResume).toBeNull();
    });
  });

  it("clears a queued marker when the user explicitly allows continuation", async () => {
    await withStore(async (store) => {
      const queued = await applyCanonicalAction(
        {
          runId: "run-explicit-allow",
          actionKey: "queue_for_morning",
          handoffAvailable: true,
          handoffState: "saved",
          handoffCapturedAt: "2026-04-25T12:00:00.000Z",
        },
        deps(store, { allowedActionKeys: ["queue_for_morning", "allow_once"] }),
      );
      expect(queued.ok).toBe(true);
      await expect(store.get("run-explicit-allow")).resolves.not.toBeNull();

      const allowed = await applyCanonicalAction(
        { runId: "run-explicit-allow", actionKey: "allow_once" },
        deps(store, { allowedActionKeys: ["queue_for_morning", "allow_once"] }),
      );
      expect(allowed.ok).toBe(true);
      await expect(store.get("run-explicit-allow")).resolves.toBeNull();
    });
  });

  it("clears a new queue marker when the backend rejects the action", async () => {
    await withStore(async (store) => {
      const result = await applyCanonicalAction(
        { runId: "run-rejected", actionKey: "queue_for_morning" },
        deps(store, {
          allowedActionKeys: ["queue_for_morning"],
          mutate: async () => ({
            applyHeadsdownAction: {
              ok: false,
              error: { code: "invalid_transition", message: "not allowed", details: {} },
            },
          }),
        }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("backend_rejected");
      await expect(store.get("run-rejected")).resolves.toBeNull();
    });
  });

  it("does not leave a queued marker when the backend action call fails", async () => {
    await withStore(async (store) => {
      const result = await applyCanonicalAction(
        { runId: "run-network-failure", actionKey: "queue_for_morning" },
        deps(store, {
          allowedActionKeys: ["queue_for_morning"],
          mutate: async () => {
            throw new Error("network unavailable");
          },
        }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("backend_unavailable");
      await expect(store.get("run-network-failure")).resolves.toBeNull();
    });
  });

  it("returns backend_unavailable when the backend action call fails", async () => {
    await withStore(async (store) => {
      const result = await applyCanonicalAction(
        { runId: "run-1", actionKey: "continue" },
        deps(store, {
          allowedActionKeys: ["continue"],
          mutate: async () => {
            throw new Error("network unavailable");
          },
        }),
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("backend_unavailable");
        expect(result.error.details.message).toBe("network unavailable");
      }
    });
  });

  it("reuses the same idempotency key after a failed queue_for_morning attempt", async () => {
    await withStore(async (store) => {
      const seenKeys: string[] = [];
      let calls = 0;

      const testDeps = deps(store, {
        allowedActionKeys: ["queue_for_morning"],
        mutate: async (input) => {
          seenKeys.push(String(input.idempotencyKey));
          calls += 1;
          if (calls === 1) throw new Error("network unavailable");
          return {
            applyHeadsdownAction: {
              ok: true,
              result: { eventId: "evt-idempotent", replayed: false },
            },
          };
        },
      });

      const first = await applyCanonicalAction(
        { runId: "run-idempotent-failure", actionKey: "queue_for_morning" },
        testDeps,
      );
      const second = await applyCanonicalAction(
        { runId: "run-idempotent-failure", actionKey: "queue_for_morning" },
        testDeps,
      );

      expect(first.ok).toBe(false);
      expect(second.ok).toBe(true);
      expect(seenKeys).toHaveLength(2);
      expect(seenKeys[0]).toBe(seenKeys[1]);
    });
  });

  it("reuses the same idempotency key for queue_for_morning retries", async () => {
    await withStore(async (store) => {
      const seenKeys: string[] = [];

      const testDeps = deps(store, {
        allowedActionKeys: ["queue_for_morning"],
        mutate: async (input) => {
          seenKeys.push(String(input.idempotencyKey));
          return {
            applyHeadsdownAction: {
              ok: true,
              result: { eventId: "evt-idempotent", replayed: seenKeys.length > 1 },
            },
          };
        },
      });

      const first = await applyCanonicalAction(
        { runId: "run-idempotent", actionKey: "queue_for_morning" },
        testDeps,
      );
      const second = await applyCanonicalAction(
        { runId: "run-idempotent", actionKey: "queue_for_morning" },
        testDeps,
      );

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      expect(seenKeys).toHaveLength(2);
      expect(seenKeys[0]).toBe(seenKeys[1]);
    });
  });
});
