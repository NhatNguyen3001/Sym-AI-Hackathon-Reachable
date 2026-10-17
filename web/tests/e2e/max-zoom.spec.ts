import { expect, test } from "@playwright/test";
import { closeDetails } from "./helpers";
import type { Page } from "@playwright/test";

// Regression: the maps allow zoom 19, but Leaflet's TileLayer stops drawing at 18 by default,
// so the last zoom step showed an empty grey map.
async function zoomToMax(page: Page) {
  const zoomIn = page.getByRole("button", { name: "Zoom in" }).first();
  for (let i = 0; i < 6; i++) {
    await zoomIn.click();
    await page.waitForTimeout(300);
  }
}

for (const path of ["/", "/route?from=mq-station&to=library"]) {
  test(`map tiles still show at maximum zoom: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator(".leaflet-tile").first()).toBeAttached({ timeout: 15_000 });
    if (path.startsWith("/route")) await closeDetails(page);   // on phones the open sheet covers the map buttons
    await zoomToMax(page);
    await expect(page.locator('.leaflet-tile[src*="/19/"]').first()).toBeAttached({ timeout: 10_000 });
  });
}
