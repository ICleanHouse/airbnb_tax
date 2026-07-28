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
    ).toBe("/bg/host?section=applications&appFilter=pending");
  });

  it("rejects unsafe, malformed, legacy-sensitive, and unavailable target destinations", () => {
    for (const destination of [
      "https://evil.example/steal",
      "//evil.example/steal",
      "/%2F%2Fevil.example",
      "/host?section=applications&reviewJob=not-a-number",
      "/host#private",
      "/host?token=secret",
      "/host?connectionId=0",
      "/deleted-object",
      "",
    ]) {
      expect(
        notificationDestination(notification({ metadata: { destination } }), "/host"),
      ).toBe("/bg/host");
    }
  });

  it("gives unknown event types a safe role-local fallback", () => {
    expect(
      notificationDestination(notification({ notification_type: "future.unknown" }), "/cleaner/jobs"),
    ).toBe("/bg/cleaner");
  });

  it("preserves the active locale for canonical and fallback destinations", () => {
    expect(
      notificationDestination(notification({ metadata: { destination: "/agency?section=work" } }), "/en/agency"),
    ).toBe("/en/agency?section=work");
    expect(notificationDestination(notification(), "/en/agency")).toBe("/en/agency");
  });

  it("maps legacy review metadata only with valid numeric IDs and otherwise falls back", () => {
    expect(
      notificationDestination(
        notification({ notification_type: "review.requested", metadata: { job_id: "17" } }),
        "/en/cleaner",
      ),
    ).toBe("/en/cleaner?section=assignments&reviewJob=17");
    expect(
      notificationDestination(
        notification({ notification_type: "review.requested", metadata: { job_id: "unknown" } }),
        "/en/cleaner",
      ),
    ).toBe("/en/cleaner");
  });

  it("routes host, cleaner, agency and admin fallbacks without a loop", () => {
    expect(notificationDestination(notification(), "/en/host")).toBe("/en/host");
    expect(notificationDestination(notification(), "/en/cleaner")).toBe("/en/cleaner");
    expect(notificationDestination(notification(), "/en/agency")).toBe("/en/agency");
    expect(notificationDestination(notification(), "/en/admin")).toBe("/en/admin");
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
    expect(
      connectionTarget(notification({ notification_type: "message.received", metadata: { connection_id: "invalid" } })),
    ).toBeNull();
  });
});
