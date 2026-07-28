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
    for (const value of ["https://evil.example", "//evil.example", "/%2F%2Fevil.example", "/host#private", "/host?token=x", "/unknown", "/host?cleaner=zero"]) {
      expect(safeInternalDestination(value)).toBeNull();
    }
  });

  it("keeps users inside their role boundary and puts locked users on /app", () => {
    expect(postAuthDestination(host, "/cleaner", "bg")).toBe("/bg/host");
    expect(postAuthDestination(host, "/bg/?cleaner=12", "en")).toBe("/bg/?cleaner=12");
    expect(postAuthDestination({ ...host, account_status: "suspended" }, "/host", "bg")).toBe("/bg/app");
  });
});
