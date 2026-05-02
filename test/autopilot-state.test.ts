import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AutopilotStateStore, DEFAULT_AUTOPILOT_STATE } from "../src/autopilot/state.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hd-claude-autopilot-state-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env.HEADSDOWN_AUTOPILOT_STATE_PATH;
});

describe("AutopilotStateStore", () => {
  it("loads defaults when the file is missing", async () => {
    const store = new AutopilotStateStore(join(tempDir, "missing.json"));

    expect(await store.load()).toEqual(DEFAULT_AUTOPILOT_STATE);
  });

  it("loads defaults when the file is corrupt", async () => {
    const path = join(tempDir, "autopilot-state.json");
    await writeFile(path, "not-json");
    const store = new AutopilotStateStore(path);

    expect(await store.load()).toEqual(DEFAULT_AUTOPILOT_STATE);
  });

  it("persists across store instances", async () => {
    const path = join(tempDir, "autopilot-state.json");
    const first = new AutopilotStateStore(path);
    const second = new AutopilotStateStore(path);
    const state = {
      ...DEFAULT_AUTOPILOT_STATE,
      lastObservedMode: "offline",
      surfacedDecisionIds: ["decision_1"],
      deferredDecisionCount: 2,
      lastSeenDeferralKey: "key_1",
      modeCachedAt: 123,
      modeCacheValue: "offline",
    };

    await first.save(state);

    expect(await second.load()).toEqual(state);
  });

  it("updates deferral count and last seen key", async () => {
    const path = join(tempDir, "autopilot-state.json");
    const store = new AutopilotStateStore(path);

    await store.update((state) => ({
      ...state,
      deferredDecisionCount: state.deferredDecisionCount + 1,
      lastSeenDeferralKey: "run:key",
    }));

    expect(await store.load()).toMatchObject({
      deferredDecisionCount: 1,
      lastSeenDeferralKey: "run:key",
    });
  });

  it("honors the env override path", async () => {
    const path = join(tempDir, "override", "autopilot-state.json");
    process.env.HEADSDOWN_AUTOPILOT_STATE_PATH = path;
    const store = new AutopilotStateStore();

    await store.save(DEFAULT_AUTOPILOT_STATE);

    expect((await stat(path)).isFile()).toBe(true);
  });

  it("writes restrictive file permissions", async () => {
    const path = join(tempDir, "autopilot-state.json");
    const store = new AutopilotStateStore(path);

    await store.save(DEFAULT_AUTOPILOT_STATE);

    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});
