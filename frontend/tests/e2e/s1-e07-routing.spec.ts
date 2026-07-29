import { expect, test } from "@playwright/test";

import { dismissCookieBanner, e2eEmails, e2ePassword, login, logout } from "./fixtures";

test.describe("S1-E07 conversion and role routing", () => {
  test("routes approved host, cleaner, agency and admin users to localized workspaces", async ({ page }) => {
    await login(page, e2eEmails.host, /\/en\/host\/?$/);
    await logout(page);
    await login(page, e2eEmails.cleaner, /\/en\/cleaner\/?$/);
    await logout(page);
    await login(page, e2eEmails.agency, /\/en\/agency\/?$/);
    await logout(page);
    await login(page, e2eEmails.admin, /\/en\/admin\/?$/);
  });

  test("keeps pending users in their existing role workspace contract", async ({ page }) => {
    await login(page, e2eEmails.pendingHost, /\/en\/host\/?$/);
    await logout(page);
    await login(page, e2eEmails.pendingCleaner, /\/en\/cleaner\/?$/);
    await logout(page);
    await login(page, e2eEmails.pendingAgency, /\/en\/agency\/?$/);
  });

  test("routes rejected and suspended users to the locked surface, including direct role URLs", async ({ page }) => {
    for (const email of [e2eEmails.rejected, e2eEmails.suspended]) {
      await login(page, email, /\/en\/app\/?$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
      await page.goto("/en/host");
      await expect(page).toHaveURL(/\/en\/app\/?$/);
      await expect(page.locator("body")).not.toContainText(/private support context|internal note/i);
      await logout(page);
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
      await logout(page);
    }

    const validPublicId = "0c6f4615-3575-42ef-9329-d97584de7b15";
    await page.goto(`/bg/login?next=${encodeURIComponent(`/bg/?cleaner=${validPublicId}`)}`);
    await dismissCookieBanner(page);
    await page.getByLabel("Имейл").fill(e2eEmails.host);
    await page.getByLabel("Парола").fill(e2ePassword());
    await page.getByRole("button", { name: "Влезте" }).click();
    await expect(page).toHaveURL(new RegExp(`/bg/\\?cleaner=${validPublicId}$`));
  });

  test("takes a guest through Connect, returns to the cleaner profile, and does not replay the request", async ({ page }) => {
    await page.goto("/en/");
    const cleanersResponse = await page.request.get("/api/accounts/public-cleaners/?city=sofia");
    expect(cleanersResponse.ok()).toBeTruthy();
    const rawCleaners = await cleanersResponse.json() as unknown;
    const cleaners = Array.isArray(rawCleaners)
      ? rawCleaners as Array<{ public_id?: string }>
      : (rawCleaners as { results?: Array<{ public_id?: string }> }).results ?? [];
    const cleanerPublicId = cleaners[0]?.public_id;
    expect(cleanerPublicId).toMatch(/^[0-9a-f-]{36}$/i);

    await page.goto(`/en/?cleaner=${cleanerPublicId}`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/login/?\\?next=.*cleaner%3D${cleanerPublicId}`));
    await dismissCookieBanner(page);
    await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", new RegExp(`^/signup/?\\?next=.*cleaner%3D${cleanerPublicId}`));

    await page.getByLabel("Email").fill(e2eEmails.host);
    await page.getByLabel("Password").fill(e2ePassword());
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/\\?cleaner=${cleanerPublicId}$`));
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();

    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText("Pending")).toBeVisible();
  });

  test("routes valid and unavailable notifications to localized role-safe destinations", async ({ page }) => {
    await login(page, e2eEmails.host, /\/en\/host\/?$/);
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: /notification/i }).click();
    await page.getByRole("button", { name: /S1 E2E host notification/i }).click();
    await expect(page).toHaveURL(/\/en\/host\/?\?section=applications&appFilter=pending$/);

    await page.getByRole("button", { name: /notification/i }).click();
    await page.getByRole("button", { name: /S1 E2E unavailable notification/i }).click();
    await expect(page).toHaveURL(/\/en\/host\/?$/);
    await logout(page);

    await login(page, e2eEmails.cleaner, /\/en\/cleaner\/?$/);
    await page.getByRole("button", { name: /notification/i }).click();
    await page.getByRole("button", { name: /S1 E2E cleaner notification/i }).click();
    await expect(page).toHaveURL(/\/en\/cleaner\/?\?section=assignments&reviewJob=\d+$/);
    await logout(page);

    await login(page, e2eEmails.agency, /\/en\/agency\/?$/);
    await page.getByRole("button", { name: /notification/i }).click();
    await page.getByRole("button", { name: /S1 E2E agency notification/i }).click();
    await expect(page).toHaveURL(/\/en\/agency\/?\?section=work$/);
  });
});
