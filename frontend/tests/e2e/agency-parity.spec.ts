import { expect, test } from "@playwright/test";

const agencyEmail = process.env.E2E_AGENCY_EMAIL;
const agencyPassword = process.env.E2E_AGENCY_PASSWORD;
const cleanerPrivateEmail = process.env.E2E_CLEANER_EMAIL;
const pendingApplicationId = process.env.E2E_PENDING_AGENCY_APPLICATION_ID;
const memberName = process.env.E2E_AGENCY_MEMBER_NAME;

async function loginAsSeededAgency(page: import("@playwright/test").Page) {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(agencyEmail!);
  await page.getByLabel("Password").fill(agencyPassword!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/agency$/);
}

test.describe("S1-D05 agency workspace", () => {
  test.skip(!agencyEmail || !agencyPassword, "Requires a seeded E2E agency account.");

  test("shows agency readiness and keeps member contact data out of invitations", async ({ page }) => {
    await loginAsSeededAgency(page);
    await expect(page.getByRole("heading", { name: "Agency readiness" })).toBeVisible();
    await page.getByRole("tab", { name: "Invitations" }).click();
    await expect(page.getByText("Invite only registered, marketplace-eligible cleaners. Contact details are never shown here.")).toBeVisible();
    if (cleanerPrivateEmail) await expect(page.locator("body")).not.toContainText(cleanerPrivateEmail);
  });

  test("selects a roster member for a pending agency application", async ({ page }) => {
    test.skip(!pendingApplicationId || !memberName, "Requires seeded pending application and eligible member.");
    await loginAsSeededAgency(page);
    await page.getByRole("tab", { name: "Work" }).click();
    const row = page.getByText(`Application #${pendingApplicationId}`, { exact: false }).locator("..");
    await row.getByRole("combobox", { name: "Selected member" }).selectOption({ label: memberName });
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
