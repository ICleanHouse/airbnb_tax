import { expect, test } from "@playwright/test";

import { e2eEmails, login } from "./fixtures";

test.describe("S1-D05 agency workspace", () => {
  test("shows agency readiness and keeps member contact data out of invitations", async ({ page }) => {
    await login(page, e2eEmails.agency, /\/en\/agency\/?$/);
    await expect(page.getByRole("heading", { name: "Agency readiness" })).toBeVisible();
    await page.getByRole("tab", { name: "Invitations" }).click();
    await expect(page.getByText("Invite only registered, marketplace-eligible cleaners. Contact details are never shown here.")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(e2eEmails.cleaner);
  });

  test("selects a roster member for a pending agency application", async ({ page }) => {
    await login(page, e2eEmails.agency, /\/en\/agency\/?$/);
    await page.getByRole("tab", { name: "Work" }).click();
    const row = page.getByText(/Application #\d+/, { exact: false }).first().locator("..");
    await row.getByRole("combobox", { name: "Selected member" }).selectOption({ label: "S1 E2E Cleaner" });
    await row.getByRole("button", { name: "Select member" }).click();
    await expect(page.getByText("The agency workspace was updated.")).toBeVisible();
  });

  test("blocks anonymous access to the agency workspace", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/en/agency");
    await expect(page.getByText("The agency workspace is unavailable.")).toBeVisible();
    await context.close();
  });
});
