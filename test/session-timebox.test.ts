import { describe, expect, it, vi } from "vitest";
import {
  requestSessionTimeboxExtensionCompat,
  resolveSessionTimeboxPrompt,
} from "../src/session-timebox.js";

describe("session timebox prompt", () => {
  const now = new Date("2026-04-28T10:00:00.000Z");

  it("activates inside the threshold for the current hosted session", () => {
    const prompt = resolveSessionTimeboxPrompt({
      currentSessionId: "session-1",
      thresholdMinutes: 15,
      now,
      sessionSummaries: [
        {
          sessionId: "session-1",
          timeboxExpiresAt: "2026-04-28T10:12:00.000Z",
          pendingTimeboxExtensionRequest: null,
        },
      ],
    });

    expect(prompt).toMatchObject({
      active: true,
      sessionId: "session-1",
      timeboxExpiresAt: "2026-04-28T10:12:00.000Z",
      remainingMinutes: 12,
      thresholdMinutes: 15,
      choices: ["Request 15 minutes", "Request 30 minutes", "Wrap up"],
    });
    expect(prompt.fingerprint).toBe("session-1:2026-04-28T10:12:00.000Z:15");
  });

  it("stays inactive outside the threshold or while an extension request is pending", () => {
    expect(
      resolveSessionTimeboxPrompt({
        currentSessionId: "session-1",
        thresholdMinutes: 15,
        now,
        sessionSummaries: [
          { sessionId: "session-1", timeboxExpiresAt: "2026-04-28T10:20:00.000Z" },
        ],
      }).active,
    ).toBe(false);

    expect(
      resolveSessionTimeboxPrompt({
        currentSessionId: "session-1",
        thresholdMinutes: 15,
        now,
        sessionSummaries: [
          {
            sessionId: "session-1",
            timeboxExpiresAt: "2026-04-28T10:12:00.000Z",
            pendingTimeboxExtensionRequest: {
              id: "request-1",
              requestedExtensionMinutes: 15,
              requestedAt: "2026-04-28T09:59:00.000Z",
            },
          },
        ],
      }).active,
    ).toBe(false);
  });

  it("uses native SDK extension requests with only session id and requested minutes", async () => {
    const requestSessionTimeboxExtension = vi.fn().mockResolvedValue({
      sessionId: "session-1",
      request: {
        id: "request-1",
        requestedExtensionMinutes: 30,
        requestedAt: "2026-04-28T10:00:00.000Z",
      },
    });

    const result = await requestSessionTimeboxExtensionCompat(
      { requestSessionTimeboxExtension } as any,
      "session-1",
      30,
    );

    expect(requestSessionTimeboxExtension).toHaveBeenCalledWith({
      sessionId: "session-1",
      requestedExtensionMinutes: 30,
    });
    expect(result.request.requestedExtensionMinutes).toBe(30);
  });
});
