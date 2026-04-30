import { describe, expect, it } from "vitest";
import {
  buildTimeBoxStatus,
  createTimeBox,
  parseTimeBoxDuration,
  resolveEffectiveAttentionWindow,
} from "../src/time-box.js";

describe("time-box duration parsing", () => {
  it("accepts documented minute and hour forms", () => {
    expect(parseTimeBoxDuration("30m")).toBe(30);
    expect(parseTimeBoxDuration("45m")).toBe(45);
    expect(parseTimeBoxDuration("1h")).toBe(60);
    expect(parseTimeBoxDuration("1h30m")).toBe(90);
  });

  it("rejects malformed or non-positive durations", () => {
    for (const input of ["", "soon", "30", "1.5h", "0m", "-5m", "1m30s"]) {
      expect(() => parseTimeBoxDuration(input)).toThrow(/duration|positive/);
    }
  });

  it("creates a normalized deadline from a duration", () => {
    const state = createTimeBox({
      durationText: "1h30m",
      sessionIdHash: "session-hash",
      now: new Date("2026-04-29T16:00:00Z"),
    });

    expect(state).toEqual({
      schemaVersion: 1,
      sessionIdHash: "session-hash",
      durationMinutes: 90,
      createdAt: "2026-04-29T16:00:00.000Z",
      expiresAt: "2026-04-29T17:30:00.000Z",
      source: "slash_command",
    });
  });
});

describe("time-box status", () => {
  it("reports remaining time and warning threshold for an active box", () => {
    const state = createTimeBox({
      durationText: "30m",
      sessionIdHash: "session-hash",
      now: new Date("2026-04-29T16:00:00Z"),
    });

    const status = buildTimeBoxStatus(state, new Date("2026-04-29T16:10:00Z"));

    expect(status.active).toBe(true);
    expect(status.deadlineAt).toBe("2026-04-29T16:30:00.000Z");
    expect(status.remainingMinutes).toBe(20);
    expect(status.thresholdMinutes).toBe(15);
    expect(status.isPastDeadline).toBe(false);
  });

  it("keeps an expired box visible as an advisory deadline until cleared", () => {
    const state = createTimeBox({
      durationText: "30m",
      sessionIdHash: "session-hash",
      now: new Date("2026-04-29T16:00:00Z"),
    });

    const status = buildTimeBoxStatus(state, new Date("2026-04-29T16:45:00Z"));

    expect(status.active).toBe(true);
    expect(status.remainingMinutes).toBe(0);
    expect(status.isPastDeadline).toBe(true);
    expect(status.message).toContain("Keep going");
  });
});

describe("effective attention window", () => {
  it("uses the box deadline when it is earlier than backend guidance", () => {
    const timeBox = createTimeBox({
      durationText: "30m",
      sessionIdHash: "session-hash",
      now: new Date("2026-04-29T16:00:00Z"),
    });

    const effective = resolveEffectiveAttentionWindow({
      backend: {
        deadlineAt: "2026-04-29T17:00:00Z",
        thresholdMinutes: 30,
        remainingMinutes: 60,
        hints: ["backend hint"],
      },
      timeBox,
      now: new Date("2026-04-29T16:10:00Z"),
      forceTimeBoxWarning: true,
    });

    expect(effective).toMatchObject({
      deadlineAt: "2026-04-29T16:30:00.000Z",
      thresholdMinutes: 15,
      remainingMinutes: 20,
      source: "time_box",
    });
    expect(effective?.hints).toContain("backend hint");
    expect(effective?.hints.join(" ")).toContain("do not stop automatically");
  });

  it("does not let a later box relax an earlier backend deadline", () => {
    const timeBox = createTimeBox({
      durationText: "1h30m",
      sessionIdHash: "session-hash",
      now: new Date("2026-04-29T16:00:00Z"),
    });

    const effective = resolveEffectiveAttentionWindow({
      backend: {
        deadlineAt: "2026-04-29T16:20:00Z",
        thresholdMinutes: 30,
        remainingMinutes: 20,
        hints: ["backend hint"],
      },
      timeBox,
      now: new Date("2026-04-29T16:05:00Z"),
      forceTimeBoxWarning: true,
    });

    expect(effective).toEqual({
      deadlineAt: "2026-04-29T16:20:00Z",
      thresholdMinutes: 30,
      remainingMinutes: 20,
      hints: ["backend hint"],
      source: "backend",
    });
  });

  it("does not let a box relax backend guidance when the backend omits a deadline timestamp", () => {
    const timeBox = createTimeBox({
      durationText: "45m",
      sessionIdHash: "session-hash",
      now: new Date("2026-04-29T16:00:00Z"),
    });

    const effective = resolveEffectiveAttentionWindow({
      backend: {
        deadlineAt: null,
        thresholdMinutes: 30,
        remainingMinutes: 5,
        hints: ["backend hint"],
      },
      timeBox,
      now: new Date("2026-04-29T16:10:00Z"),
      forceTimeBoxWarning: true,
    });

    expect(effective).toEqual({
      deadlineAt: null,
      thresholdMinutes: 30,
      remainingMinutes: 5,
      hints: ["backend hint"],
      source: "backend",
    });
  });

  it("does not trigger a standalone box warning until the threshold is reached", () => {
    const timeBox = createTimeBox({
      durationText: "1h",
      sessionIdHash: "session-hash",
      now: new Date("2026-04-29T16:00:00Z"),
    });

    expect(
      resolveEffectiveAttentionWindow({
        backend: null,
        timeBox,
        now: new Date("2026-04-29T16:20:00Z"),
      }),
    ).toBeNull();

    expect(
      resolveEffectiveAttentionWindow({
        backend: null,
        timeBox,
        now: new Date("2026-04-29T16:50:00Z"),
      }),
    ).toMatchObject({ source: "time_box", remainingMinutes: 10 });
  });
});
