import { describe, expect, it } from "vitest";

import bg from "./bg.json";
import en from "./en.json";

type PasswordRecoveryMessages = {
  emailLabel: string;
  newPasswordLabel: string;
  confirmPasswordLabel: string;
  backToLogin: string;
  support: string;
  request: Record<"heading" | "copy" | "submit" | "submitting" | "success" | "error", string>;
  confirm: Record<"heading" | "copy" | "submit" | "submitting" | "mismatch" | "error" | "invalidHeading" | "invalidCopy" | "successHeading" | "successCopy", string>;
};

describe("password recovery translations", () => {
  it.each([
    ["en", en.passwordRecovery],
    ["bg", bg.passwordRecovery],
  ])("provides every forgot/reset message in %s", (_locale, messages) => {
    const values = Object.values(messages as PasswordRecoveryMessages).flatMap((value) =>
      typeof value === "string" ? [value] : Object.values(value),
    );

    expect(values).toHaveLength(21);
    expect(values.every((value) => typeof value === "string" && value.trim().length > 0)).toBe(true);
  });
});
