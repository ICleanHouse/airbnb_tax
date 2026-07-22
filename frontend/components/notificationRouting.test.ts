import { describe, expect, it } from "vitest";

import type { AppNotification } from "../types/notification";
import {
  connectionTarget,
  notificationDestination,
} from "./notificationRouting";

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 1,
    notification_type: "job.cancelled",
    channel: "in_app",
    title: "Update",
    body: "Open the app.",
    metadata: {},
    read_at: null,
    created_at: "2026-07-22T10:00:00Z",
    ...overrides,
  };
}

describe("notification routing", () => {
  it("uses an approved canonical relative destination", () => {
    expect(
      notificationDestination(
        notification({ metadata: { destination: "/host?section=applications&appFilter=pending" } }),
        "/host",
      ),
    ).toBe("/host?section=applications&appFilter=pending");
  });

  it("rejects external, protocol-relative, fragment, and sensitive query destinations", () => {
    for (const destination of [
      "https://evil.example/steal",
      "//evil.example/steal",
      "/host#private",
      "/host?token=secret",
    ]) {
      expect(
        notificationDestination(notification({ metadata: { destination } }), "/host"),
      ).toBe("/host");
    }
  });

  it("gives unknown event types a safe role-local fallback", () => {
    expect(
      notificationDestination(notification({ notification_type: "future.unknown" }), "/cleaner/jobs"),
    ).toBe("/cleaner");
  });

  it("extracts canonical connection destinations without exposing message text", () => {
    expect(
      connectionTarget(
        notification({
          notification_type: "message.received",
          metadata: { destination: "/app?connectionId=42" },
        }),
      ),
    ).toEqual({ connectionId: 42, openChat: true });
  });
});
