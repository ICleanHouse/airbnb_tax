import { expect, type Page } from "@playwright/test";

const PREFIX = "s1e07-e2e-";

export const e2eEmails = {
  host: `${PREFIX}host@e2e.invalid`,
  cleaner: `${PREFIX}cleaner@e2e.invalid`,
  agency: `${PREFIX}agency@e2e.invalid`,
  admin: `${PREFIX}admin@e2e.invalid`,
  pendingHost: `${PREFIX}pending-host@e2e.invalid`,
  pendingCleaner: `${PREFIX}pending-cleaner@e2e.invalid`,
  pendingAgency: `${PREFIX}pending-agency@e2e.invalid`,
  rejected: `${PREFIX}rejected@e2e.invalid`,
  suspended: `${PREFIX}suspended@e2e.invalid`,
  inactive: `${PREFIX}inactive@e2e.invalid`,
} as const;

export function e2ePassword(): string {
  const password = process.env.E2E_PASSWORD;
  if (!password) {
    throw new Error("E2E_PASSWORD is required. Run the guarded seed_s1_e07_e2e command first.");
  }
  return password;
}

export async function login(page: Page, email: string, destination: RegExp): Promise<void> {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(e2ePassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(destination);
}
