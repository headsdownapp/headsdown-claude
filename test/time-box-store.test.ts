import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalTimeBoxStore, hashSessionId } from "../src/time-box-store.js";
import { createTimeBox } from "../src/time-box.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hd-claude-time-box-store-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("LocalTimeBoxStore", () => {
  it("persists a box across store instances for the same session", async () => {
    const path = join(tempDir, "time-box.json");
    const sessionHash = hashSessionId("session-a");
    const first = new LocalTimeBoxStore(path, sessionHash);
    const second = new LocalTimeBoxStore(path, sessionHash);
    const state = createTimeBox({
      durationText: "45m",
      sessionIdHash: sessionHash,
      now: new Date("2026-04-29T16:00:00Z"),
    });

    await first.save(state);

    expect(await second.load()).toEqual(state);
  });

  it("isolates boxes by session hash even when pointed at the same file", async () => {
    const path = join(tempDir, "time-box.json");
    const firstHash = hashSessionId("session-a");
    const secondHash = hashSessionId("session-b");
    const first = new LocalTimeBoxStore(path, firstHash);
    const second = new LocalTimeBoxStore(path, secondHash);
    const state = createTimeBox({
      durationText: "45m",
      sessionIdHash: firstHash,
      now: new Date("2026-04-29T16:00:00Z"),
    });

    await first.save(state);

    expect(await first.load()).toEqual(state);
    expect(await second.load()).toBeNull();
  });

  it("clears the current box idempotently", async () => {
    const path = join(tempDir, "time-box.json");
    const sessionHash = hashSessionId("session-a");
    const store = new LocalTimeBoxStore(path, sessionHash);
    const state = createTimeBox({
      durationText: "45m",
      sessionIdHash: sessionHash,
      now: new Date("2026-04-29T16:00:00Z"),
    });

    await store.save(state);
    expect(await store.clear()).toBe(true);
    expect(await store.load()).toBeNull();
    expect(await store.clear()).toBe(false);
  });
});
