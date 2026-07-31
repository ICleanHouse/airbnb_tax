import { expect, test } from "@playwright/test";

import { dismissCookieBanner, e2eEmails, login, logout } from "./fixtures";

const SOURCE_JOB_TITLE = "S1 E05 Recovery Browser";

test.describe("S1-E05 agency recovery", () => {
  test("keeps recovery authorization and review recipients in the browser workflow", async ({ page }) => {
    await login(page, e2eEmails.agency, /\/en\/agency\/?$/);
    await dismissCookieBanner(page);

    await page.getByRole("tab", { name: "Assignments" }).click();
    const sourceAssignment = page.locator(".agency-assignment").filter({ hasText: SOURCE_JOB_TITLE });
    await sourceAssignment.getByRole("button", { name: "Cancel job" }).click();
    await page.getByLabel("Reason").selectOption("cleaner_unavailable");
    await page.getByRole("button", { name: "Cancel job" }).click();

    await page.getByRole("tab", { name: "History" }).click();
    const cancelledSource = page.locator(".agency-list > li").filter({ hasText: SOURCE_JOB_TITLE });
    await cancelledSource.getByRole("button", { name: "Report attendance incident" }).click();
    await page.getByLabel("Private details (operators only)").fill("Disposable browser recovery incident.");
    await page.getByRole("button", { name: "Submit" }).click();

    await cancelledSource.getByRole("button", { name: "Request replacement" }).click();
    const incidentId = cancelledSource.getByLabel("Qualifying incident ID");
    await expect(incidentId).toHaveValue(/\d+/);
    const qualifyingIncidentId = await incidentId.inputValue();
    await page.getByRole("button", { name: "Submit" }).click();

    // The same visible form remains usable so the controlled duplicate rejection
    // is tested through the product UI, without a direct API call.
    await cancelledSource.getByRole("button", { name: "Request replacement" }).click();
    await cancelledSource.getByLabel("Qualifying incident ID").fill(qualifyingIncidentId);
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(cancelledSource).toContainText("A replacement request is already actionable for this job.");

    await logout(page);
    await login(page, e2eEmails.host, /\/en\/host\/?$/);
    await page.getByRole("button", { name: "Authorize replacement" }).click();
    await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
    await page.getByRole("button", { name: "Publish" }).click();

    await logout(page);
    await login(page, e2eEmails.agency, /\/en\/agency\/?$/);
    await page.getByRole("tab", { name: "Find work" }).click();
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("Application submitted")).toBeVisible();
    await page.getByRole("tab", { name: "Work" }).click();
    const pendingApplication = page.getByText(/Application #\d+/, { exact: false }).last().locator("..");
    await pendingApplication.getByRole("combobox", { name: "Selected member" }).selectOption({ label: "S1 E2E Cleaner Cleaner" });
    await pendingApplication.getByRole("button", { name: "Select member" }).click();

    await logout(page);
    await login(page, e2eEmails.host, /\/en\/host\/?$/);
    await page.getByRole("button", { name: "Applications" }).click();
    const successorApplication = page.locator(".host-app-card").filter({ hasText: SOURCE_JOB_TITLE });
    await successorApplication.getByRole("button", { name: "Accept" }).click();

    await logout(page);
    await login(page, e2eEmails.cleaner, /\/en\/cleaner\/?$/);
    await page.getByRole("button", { name: "Applications" }).click();
    const successorAssignment = page.locator(".host-app-card").filter({ hasText: SOURCE_JOB_TITLE });
    await successorAssignment.getByRole("button", { name: "Mark done" }).click();
    await page.getByRole("button", { name: /notification/i }).click();
    await expect(page.locator(".notif-dropdown")).toContainText("Leave a review");

    await logout(page);
    await login(page, e2eEmails.host, /\/en\/host\/?$/);
    await page.getByRole("button", { name: /notification/i }).click();
    await expect(page.locator(".notif-dropdown")).toContainText("Leave a review");

    await logout(page);
    await login(page, e2eEmails.agency, /\/en\/agency\/?$/);
    await page.getByRole("button", { name: /notification/i }).click();
    await expect(page.locator(".notif-dropdown")).not.toContainText("Leave a review");
  });
});
