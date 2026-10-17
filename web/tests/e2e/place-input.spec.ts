import { expect, test } from "@playwright/test";
import { startAtStation } from "./helpers";

// Regression: typing then pressing Enter quickly picked a stale suggestion. The focus search (empty query,
// all places, station first) landed after the text changed, so Enter chose "Macquarie University station"
// and the trip became station -> station.
test("Enter right after typing picks a place matching what was typed", async ({ page }) => {
  await page.goto("/");
  await startAtStation(page);
  const to = page.getByRole("combobox", { name: "Where to?" }).filter({ visible: true }).first();
  await to.fill("waranara");
  await to.press("Enter");
  await expect(to).toHaveValue("Waranara Library");
  await page.getByRole("button", { name: "Show a step-free route" }).click();
  await expect(page).toHaveURL(/\/route\?from=mq-station&to=library/);
});

test("Enter with no matching place does not pick anything", async ({ page }) => {
  await page.goto("/");
  const to = page.getByRole("combobox", { name: "Where to?" });
  await to.fill("zzzz no such place");
  await to.press("Enter");
  await expect(to).toHaveValue("zzzz no such place");
  await expect(page.getByRole("button", { name: "Show a step-free route" })).toBeDisabled();
});


/** Holds the full place search (not the instant known-places one) until release() is called. */
async function slowFullSearch(page: import("@playwright/test").Page) {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route(/\/places\?q=/, async (route) => {
    if (route.request().url().includes("photon=0")) return route.continue();
    await gate;
    await route.continue();
  });
  return () => release();
}

test("known places show at once while the full search is still running", async ({ page }) => {
  const release = await slowFullSearch(page);
  await page.goto("/");
  const to = page.getByRole("combobox", { name: "Where to?" });
  await to.fill("wara");
  await expect(page.getByRole("option", { name: /Waranara Library/ })).toBeVisible({ timeout: 3_000 });
  await expect(page.getByRole("status").filter({ hasText: "Searching…" })).toBeVisible();
  release();
  await expect(page.getByRole("status").filter({ hasText: "Searching…" })).toHaveCount(0);
});

test("a late search result never changes a place you already picked", async ({ page }) => {
  const release = await slowFullSearch(page);
  await page.goto("/");
  await startAtStation(page);
  const to = page.getByRole("combobox", { name: "Where to?" }).filter({ visible: true }).first();
  await to.fill("wara");
  await page.getByRole("option", { name: /Waranara Library/ }).click();
  await expect(to).toHaveValue("Waranara Library");
  release();
  await page.waitForTimeout(800);
  await expect(to).toHaveValue("Waranara Library");
  await expect(page.getByRole("button", { name: "Show a step-free route" })).toBeEnabled();
});

test("picking a place after pressing Enter isn't undone when the search finishes", async ({ page }) => {
  const release = await slowFullSearch(page);
  await page.goto("/");
  const to = page.getByRole("combobox", { name: "Where to?" });
  await to.fill("caf");
  await to.press("Enter");                                    // before the 250 ms debounce: Enter waits for the full search
  await page.getByRole("option", { name: /Globe Caf/ }).click();
  await expect(to).toHaveValue("Globe Café");
  release();
  await page.waitForTimeout(800);
  await expect(to).toHaveValue("Globe Café");
});
