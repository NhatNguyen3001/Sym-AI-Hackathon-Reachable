import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The e2e API seeds ~40 OpenStreetMap places around Macquarie Park and one Claude-checked roadwork (SEED_MAP_PLACES).
// The visitor is at Macquarie Centre, so the map opens there on any screen size.
test.use({ geolocation: { latitude: -33.7768, longitude: 151.1205 }, permissions: ["geolocation"] });

async function zoomTo(page: import("@playwright/test").Page, target: number) {
  const region = page.getByRole("region", { name: "Live map" });
  for (let i = 0; i < 8; i++) {
    const z = Number(await region.getAttribute("data-zoom"));
    if (z === target) return;
    await page.getByRole("button", { name: z > target ? "Zoom out" : "Zoom in" }).filter({ visible: true }).click();
    await page.waitForTimeout(450);
  }
}

test("zoomed out, places become number bubbles", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Accessible toilet at Macquarie Centre toilets \(OpenStreetMap\)/ }))
    .toBeAttached({ timeout: 20_000 });
  await zoomTo(page, 14);
  await expect(page.getByRole("button", { name: /\d+ places here, tap to see them/ }).first()).toBeVisible();
  const r = await new AxeBuilder({ page }).include('[aria-label="Live map"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});

test("a place pin plans a route there", async ({ page }) => {
  await page.goto("/");
  const pin = page.getByRole("button", { name: /Accessible toilet at Macquarie Centre toilets \(OpenStreetMap\)/ });
  await expect(pin).toBeAttached({ timeout: 20_000 });
  await pin.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/route\?.*to=place%3Aosm-n900001/);
});

test("a Claude-checked roadwork shows what it means for you", async ({ page }) => {
  await page.goto("/");
  const pin = page.getByRole("button", { name: /Roadworks: Footpath works/ });
  await expect(pin).toBeAttached({ timeout: 20_000 });
  await pin.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("The footpath on the east side of Herring Road is closed; use the west side.")).toBeVisible();
  await expect(page.getByText(/Live Traffic NSW, checked by Claude/)).toBeVisible();
});

test("the map says when its places were updated", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/^OpenStreetMap places from \d+ \w+ \(saved copy\)$|^Places and roadworks updated/).first())
    .toBeVisible({ timeout: 20_000 });
});
