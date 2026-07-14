import { beforeEach, describe, expect, it } from "vitest";

import {
  SIGNUP_RECOVERY_KEY,
  SIGNUP_RECOVERY_TTL_MS,
  clearSignupRecovery,
  restoreSignupRecovery,
  saveSignupRecovery,
} from "./signupRecovery";

const NOW = Date.UTC(2026, 6, 14, 12, 0, 0);

describe("signup recovery storage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("persists only the explicit non-sensitive allowlist", () => {
    saveSignupRecovery(
      sessionStorage,
      {
        role: "cleaner",
        citySlug: "sofia",
        selectedZoneIds: ["sofia:osm-1", "sofia:osm-144"],
        experienceLevel: "3_years",
        password: "Password-secret-123!",
        confirmPassword: "Password-secret-123!",
        emailVerificationToken: "verification-secret",
      } as never,
      NOW,
    );

    const raw = sessionStorage.getItem(SIGNUP_RECOVERY_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? "{}")).toEqual({
      version: 1,
      savedAt: NOW,
      role: "cleaner",
      citySlug: "sofia",
      selectedZoneIds: ["sofia:osm-1", "sofia:osm-144"],
      experienceLevel: "3_years",
    });
    expect(raw).not.toContain("Password-secret-123!");
    expect(raw).not.toContain("verification-secret");
    expect(localStorage).toHaveLength(0);
  });

  it("does not create recovery state when no allowlisted progress exists", () => {
    saveSignupRecovery(
      sessionStorage,
      { role: null, citySlug: "", selectedZoneIds: [], experienceLevel: "" },
      NOW,
    );

    expect(sessionStorage.getItem(SIGNUP_RECOVERY_KEY)).toBeNull();
  });

  it("persists only catalog-recognized cities and approved canonical zone ids", () => {
    saveSignupRecovery(
      sessionStorage,
      {
        role: "cleaner",
        citySlug: "private-secret-city",
        selectedZoneIds: [
          "password:secret",
          "private-secret-city:zone-1",
          "sofia:osm-66",
        ],
        experienceLevel: "3_years",
      },
      NOW,
    );

    expect(JSON.parse(sessionStorage.getItem(SIGNUP_RECOVERY_KEY) ?? "{}"))
      .toEqual({
        version: 1,
        savedAt: NOW,
        role: "cleaner",
        citySlug: "",
        selectedZoneIds: [],
        experienceLevel: "3_years",
      });

    saveSignupRecovery(
      sessionStorage,
      {
        role: "cleaner",
        citySlug: "sofia",
        selectedZoneIds: [
          "sofia:osm-1",
          "sofia:osm-144",
          "sofia:osm-145",
          "sofia:lozenets",
          "password:secret",
        ],
        experienceLevel: "3_years",
      },
      NOW,
    );

    expect(JSON.parse(sessionStorage.getItem(SIGNUP_RECOVERY_KEY) ?? "{}"))
      .toMatchObject({
        citySlug: "sofia",
        selectedZoneIds: ["sofia:osm-1", "sofia:osm-144"],
      });

    saveSignupRecovery(
      sessionStorage,
      {
        role: "cleaner",
        citySlug: "plovdiv",
        selectedZoneIds: ["plovdiv:center", "password:secret"],
        experienceLevel: "3_years",
      },
      NOW,
    );

    expect(JSON.parse(sessionStorage.getItem(SIGNUP_RECOVERY_KEY) ?? "{}"))
      .toMatchObject({ citySlug: "plovdiv", selectedZoneIds: [] });
  });

  it("sanitizes a legacy object immediately and restores only useful fields", () => {
    sessionStorage.setItem(
      SIGNUP_RECOVERY_KEY,
      JSON.stringify({
        step: "profile_photo",
        firstName: "Private",
        email: "private@example.test",
        password: "legacy-password-secret",
        confirmPassword: "legacy-password-secret",
        emailVerificationToken: "legacy-token-secret",
        code: "123456",
        role: "cleaner",
        city: "sofia",
        selectedZones: [
          "sofia:osm-1",
          "sofia:lozenets",
          "sofia:osm-145",
          "invalid-zone",
          "sofia:osm-1",
        ],
        experience: "2_years",
      }),
    );
    sessionStorage.setItem("signup_draft", JSON.stringify({ password: "draft-secret" }));
    sessionStorage.setItem("signup_email_verification_token", "separate-token-secret");

    const restored = restoreSignupRecovery(sessionStorage, NOW);

    expect(restored).toEqual({
      version: 1,
      savedAt: NOW,
      role: "cleaner",
      citySlug: "sofia",
      selectedZoneIds: ["sofia:osm-1"],
      experienceLevel: "2_years",
    });
    expect(sessionStorage.getItem("signup_draft")).toBeNull();
    expect(sessionStorage.getItem("signup_email_verification_token")).toBeNull();
    const sanitized = sessionStorage.getItem(SIGNUP_RECOVERY_KEY) ?? "";
    expect(sanitized).not.toMatch(/legacy-password-secret|legacy-token-secret|draft-secret|separate-token-secret|123456/);
    expect(Object.keys(JSON.parse(sanitized))).toEqual([
      "version",
      "savedAt",
      "role",
      "citySlug",
      "selectedZoneIds",
      "experienceLevel",
    ]);
  });

  it("migrates allowed individual legacy keys and deletes every legacy key", () => {
    sessionStorage.setItem("signup_role", "host");
    sessionStorage.setItem("signup_city", "sofia");
    sessionStorage.setItem("signup_zones", JSON.stringify(["sofia:osm-66"]));
    sessionStorage.setItem("signup_experience_level", "none");
    sessionStorage.setItem("signup_birth_date", "1990-01-01");
    sessionStorage.setItem("signup_introduction", "private free text");

    expect(restoreSignupRecovery(sessionStorage, NOW)).toMatchObject({
      role: "host",
      citySlug: "sofia",
      selectedZoneIds: ["sofia:osm-66"],
      experienceLevel: "none",
    });
    expect(sessionStorage.getItem("signup_birth_date")).toBeNull();
    expect(sessionStorage.getItem("signup_introduction")).toBeNull();
    expect(sessionStorage.getItem(SIGNUP_RECOVERY_KEY)).not.toContain("private free text");
  });

  it("migrates only exact legacy Sofia canonical names", () => {
    sessionStorage.setItem("signup_role", "cleaner");
    sessionStorage.setItem("signup_city", "sofia");
    sessionStorage.setItem(
      "signup_zones",
      JSON.stringify([
        "ж.к. Лозенец",
        "ж.к. Банишора",
        "Лозенец",
        "password:secret",
      ]),
    );

    expect(restoreSignupRecovery(sessionStorage, NOW)).toMatchObject({
      citySlug: "sofia",
      selectedZoneIds: ["sofia:osm-66", "sofia:osm-1"],
    });
    expect(sessionStorage.getItem(SIGNUP_RECOVERY_KEY)).not.toContain("password:secret");
  });

  it("discards expired and malformed recovery state", () => {
    sessionStorage.setItem(
      SIGNUP_RECOVERY_KEY,
      JSON.stringify({
        version: 1,
        savedAt: NOW - SIGNUP_RECOVERY_TTL_MS - 1,
        role: "cleaner",
        citySlug: "sofia",
        selectedZoneIds: ["sofia:osm-1"],
        experienceLevel: "1_year",
      }),
    );
    expect(restoreSignupRecovery(sessionStorage, NOW)).toBeNull();
    expect(sessionStorage.getItem(SIGNUP_RECOVERY_KEY)).toBeNull();

    sessionStorage.setItem(SIGNUP_RECOVERY_KEY, "{not-json");
    expect(restoreSignupRecovery(sessionStorage, NOW)).toBeNull();
    expect(sessionStorage.getItem(SIGNUP_RECOVERY_KEY)).toBeNull();
  });

  it("clears current and legacy recovery records", () => {
    sessionStorage.setItem(SIGNUP_RECOVERY_KEY, "{}");
    sessionStorage.setItem("signup_draft", "{}");
    sessionStorage.setItem("signup_password", "must-go");

    clearSignupRecovery(sessionStorage);

    expect(sessionStorage).toHaveLength(0);
  });
});
