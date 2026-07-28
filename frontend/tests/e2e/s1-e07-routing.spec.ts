import { expect, test } from "@playwright/test";

import { e2eEmails, e2ePassword, login } from "./fixtures";

test.describe("S1-E07 conversion and role routing", () => {
  test("routes approved host, cleaner, agency and admin users to localized workspaces", async ({ page }) => {
    await login(page, e2eEmails.host, /\/en\/host\/?$/);
    await page.getByRole("button", { name: /log out/i }).click();
    await login(page, e2eEmails.cleaner, /\/en\/cleaner\/?$/);
    await page.getByRole("button", { name: /log out/i }).click();
    await login(page, e2eEmails.agency, /\/en\/agency\/?$/);
    await page.getByRole("button", { name: /log out/i }).click();
    await login(page, e2eEmails.admin, /\/en\/admin\/?$/);
  });

  test("keeps pending users in their existing role workspace contract", async ({ page }) => {
    await login(page, e2eEmails.pendingHost, /\/en\/host\/?$/);
    await page.getByRole("button", { name: /log out/i }).click();
    await login(page, e2eEmails.pendingCleaner, /\/en\/cleaner\/?$/);
    await page.getByRole("button", { name: /log out/i }).click();
    await login(page, e2eEmails.pendingAgency, /\/en\/agency\/?$/);
  });

  test("routes rejected and suspended users to the locked surface, including direct role URLs", async ({ page }) => {
    for (const email of [e2eEmails.rejected, e2eEmails.suspended]) {
      await login(page, email, /\/en\/app\/?$/);
      await expect(page.getByRole("heading")).toBeFocused();
      await page.goto("/en/host");
      await expect(page).toHaveURL(/\/en\/app\/?$/);
      await expect(page.locator("body")).not.toContainText(/private support context|internal note/i);
      await page.getByRole("button", { name: /log out/i }).click();
    }
  });

  test("rejects inactive credentials with a stable generic login error", async ({ page }) => {
    await page.goto("/en/login");
    await page.getByLabel("Email").fill(e2eEmails.inactive);
    await page.getByLabel("Password").fill(e2ePassword());
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/login/);
    await expect(page.getByText("Check your email and password and try again.")).toBeVisible();
  });

  test("rejects malicious and role-inappropriate next destinations in the browser", async ({ page }) => {
    const values = [
      "https://evil.example", "http://evil.example", "//evil.example", "/%2F%2Fevil.example",
      "/%252F%252Fevil.example", "/\\evil.example", "/host#private", "/host?token=secret",
      "/host?next=%2Fcleaner", "/unknown", "javascript:alert(1)", "data:text/html,unsafe",
    ];
    for (const next of values) {
      await page.goto(`/en/login?next=${encodeURIComponent(next)}`);
      await page.getByLabel("Email").fill(e2eEmails.host);
      await page.getByLabel("Password").fill(e2ePassword());
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/en\/host\/?$/);
      await page.getByRole("button", { name: /log out/i }).click();
    }

    await page.goto("/bg/login?next=%2Fbg%2F%3Fcleaner%3D1");
    await page.getByLabel("Имейл").fill(e2eEmails.host);
    await page.getByLabel("Парола").fill(e2ePassword());
    await page.getByRole("button", { name: "Влезте" }).click();
    await expect(page).toHaveURL(/\/bg\/\?cleaner=1$/);
  });

  test("takes a guest through Connect, returns to the cleaner profile, and does not replay the request", async ({ page }) => {
    await page.goto("/en/");
    const cleanersResponse = await page.request.get("/api/accounts/public-cleaners/?city=sofia");
    expect(cleanersResponse.ok()).toBeTruthy();
    const rawCleaners = await cleanersResponse.json() as unknown;
    const cleaners = Array.isArray(rawCleaners)
      ? rawCleaners as Array<{ id?: number; user_id?: number }>
      : (rawCleaners as { results?: Array<{ id?: number; user_id?: number }> }).results ?? [];
    const cleanerId = cleaners[0]?.id;
    expect(cleanerId).toBeTruthy();

    await page.goto(`/en/?cleaner=${cleanerId}`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/login\\?next=.*cleaner%3D${cleanerId}`));
    await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", new RegExp(`^/signup\\?next=.*cleaner%3D${cleanerId}`));

    await page.getByLabel("Email").fill(e2eEmails.host);
    await page.getByLabel("Password").fill(e2ePassword());
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/\\?cleaner=${cleanerId}$`));
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();

    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText("Pending")).toBeVisible();
  });
});
