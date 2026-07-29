import { expect, test } from "@playwright/test";

import { dismissCookieBanner, e2eEmails, login } from "./fixtures";

test.describe("S1-E10 private geocoding boundary", () => {
  test("an approved host uses only the owned lookup API", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    await login(page, e2eEmails.host, /\/en\/host\/?$/);
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: "Add property" }).click();
    const dialog = page.getByRole("dialog", { name: "Add property" });
    await expect(dialog).toBeVisible();

    const lookupResponse = page.waitForResponse((response) =>
      response.url().includes("/api/locations/geocode/search/"),
    );
    await dialog.getByPlaceholder("Search address in Bulgaria…").fill("S1 E10 test address");
    await dialog.getByRole("button", { name: "Search" }).click();
    await lookupResponse;

    const lookupRequests = requests.filter((url) => url.includes("/api/locations/geocode/"));
    expect(lookupRequests).toHaveLength(1);
    expect(lookupRequests[0]).toContain("/api/locations/geocode/search/");
    expect(requests.some((url) => /geoapify|nominatim|tile\.openstreetmap/i.test(url))).toBeFalsy();

    await dialog.getByLabel("City *").selectOption("Plovdiv");
    await dialog.getByLabel("Property name *").fill("S1 E10 manual property");
    await dialog.getByLabel("Street address").fill("Manual test address");
    await dialog.getByRole("button", { name: "Add property" }).last().click();

    await expect(dialog).toBeHidden();
  });

  test("manual property entry remains usable when lookup returns 503", async ({ page }) => {
    await page.route("**/api/locations/geocode/search/", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "geocoding_unavailable" }),
    }));
    await login(page, e2eEmails.host, /\/en\/host\/?$/);
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: "Add property" }).click();
    const dialog = page.getByRole("dialog", { name: "Add property" });
    await dialog.getByPlaceholder("Search address in Bulgaria…").fill("S1 E10 fallback address");
    await dialog.getByRole("button", { name: "Search" }).click();
    await expect(dialog.getByRole("status")).toBeVisible();

    await dialog.getByLabel("City *").selectOption("Plovdiv");
    await dialog.getByLabel("Property name *").fill("S1 E10 fallback property");
    await dialog.getByLabel("Street address").fill("Manual fallback address");
    await dialog.getByRole("button", { name: "Add property" }).last().click();
    await expect(dialog).toBeHidden();
  });
});
