import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { startAtStation } from "./helpers";

/** Hold the route request for `ms` so the loading state can be seen. */
async function slowRoute(page: Page, ms = 1500) {
  await page.route(/\/route$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  });
}

test("the route panel opens at once with placeholders, and the pins show before the route", async ({ page }) => {
  await slowRoute(page);
  await page.goto("/route?from=mq-station&to=library");
  const aside = page.getByRole("complementary", { name: "Route details" });
  await expect(aside.getByText("Macquarie University station → Waranara Library")).toBeVisible({ timeout: 1000 });
  await expect(aside.locator('[aria-busy="true"]')).toBeVisible();
  await expect(page.locator("path.route-start")).toBeAttached();
  await expect(page.locator("path.route-end")).toBeAttached();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await expect(aside.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
  await expect(aside.getByText(/^\d+ min$/).first()).toBeVisible();
});

test("placeholders don't shimmer with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await slowRoute(page);
  await page.goto("/route?from=mq-station&to=library");
  const block = page.locator(".skeleton").first();
  await expect(block).toBeVisible({ timeout: 1000 });
  expect(await block.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});

test("buttons that start work say so at once", async ({ page }) => {
  await slowRoute(page, 3000);
  await page.goto("/");
  await startAtStation(page);
  const to = page.getByRole("combobox", { name: "Where to?" }).filter({ visible: true }).first();
  await to.fill("waranara");
  await page.getByRole("option", { name: /Waranara Library/ }).click();
  const go = page.getByRole("button", { name: /Show a step-free route|Finding…/ });
  await go.click();
  await expect(page.getByRole("button", { name: "Finding…" }).or(page.getByRole("complementary", { name: "Route details" }))).toBeVisible({ timeout: 500 });

  await page.goto("/report");
  await page.route(/\/reports$/, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.getByRole("button", { name: "Stairs" }).click();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled({ timeout: 500 });
});
