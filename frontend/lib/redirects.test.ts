import { describe, expect, it } from "vitest";

import { postAuthDestination, safeInternalDestination, withLocale } from "./redirects";

const host = {
  id: 1, username: "host", email: "host@example.test", first_name: "", last_name: "", phone_number: "",
  preferred_language: "bg" as const, role: "host" as const, account_status: "approved" as const,
  is_approved: true, is_platform_admin: false,
};

describe("safe internal destinations", () => {
  it("accepts supported internal localized routes", () => {
    expect(safeInternalDestination("/bg/host?section=applications")).toBe("/bg/host?section=applications");
    expect(withLocale("/?cleaner=12", "en")).toBe("/en/?cleaner=12");
  });

  it("rejects external, encoded-external, malformed, unsupported, and sensitive destinations", () => {
    for (const value of [
      "https://evil.example",
      "http://evil.example",
      "//evil.example",
      "/%2F%2Fevil.example",
      "/%252F%252Fevil.example",
      "/\\evil.example",
      "/%E0%A4%A",
      "/host#private",
      "/host?token=x",
      "/host?next=%2Fhost",
      "/unknown",
      "/host?cleaner=zero",
      "javascript:alert(1)",
      "data:text/html,unsafe",
      `/${"a".repeat(513)}`,
    ]) {
      expect(safeInternalDestination(value)).toBeNull();
    }
  });

  it("keeps users inside their role boundary and puts locked users on /app", () => {
    expect(postAuthDestination(host, "/cleaner", "bg")).toBe("/bg/host");
    expect(postAuthDestination(host, "/bg/?cleaner=12", "en")).toBe("/bg/?cleaner=12");
    expect(postAuthDestination({ ...host, account_status: "suspended" }, "/host", "bg")).toBe("/bg/app");
  });

  it("accepts bounded route queries and rejects role-inappropriate returns", () => {
    expect(safeInternalDestination("/en/?cleaner=12")).toBe("/en/?cleaner=12");
    expect(safeInternalDestination("/bg/host?section=applications&appFilter=pending")).toBe("/bg/host?section=applications&appFilter=pending");
    expect(postAuthDestination(host, "/agency", "en")).toBe("/en/host");
    expect(postAuthDestination(host, "/?cleaner=12", "bg")).toBe("/bg/?cleaner=12");
  });
});
