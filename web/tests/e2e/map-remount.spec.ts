import { expect, test } from "@playwright/test";
import { closeDetails } from "./helpers";
import type { Page } from "@playwright/test";

/** Live updates is in the sidebar on desktop and behind the menu button on phones. */
async function openLiveUpdates(page: Page) {
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: "Live updates" }).filter({ visible: true }).first().click();
}

// Regression: Next keeps visited pages mounted but hidden (React Activity). Coming back to /route re-ran
// react-leaflet's effects on a map its cleanup had already destroyed: "Map container is being reused by
// another instance", "reading 'appendChild'", "reading '_targets'".
test("the route map survives navigating away and back", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/route?from=mq-station&to=library");
  await expect(page.locator(".leaflet-container")).toBeVisible();

  await openLiveUpdates(page);
  await page.waitForURL("**/live");
  await page.goBack();
  await page.waitForURL("**/route**");

  const map = page.getByRole("region", { name: "Route map" });
  await expect(map.locator(".leaflet-container")).toBeVisible();
  await expect(map.locator(".leaflet-tile-pane")).toHaveCount(1);
  await closeDetails(page);   // on phones the open sheet covers the map buttons
  await map.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test("the report pin picker survives being closed and reopened", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/report");
  await page.getByRole("button", { name: "Change location" }).click();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await openLiveUpdates(page);
  await page.waitForURL("**/live");
  await page.goBack();
  await page.waitForURL("**/report");
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
