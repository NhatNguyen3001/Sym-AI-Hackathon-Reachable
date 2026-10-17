import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The sidebar and the route panel collapse with a round handle on their edge (desktop only).
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "desktop sidebar");
});

const axeClean = async (page: import("@playwright/test").Page) => {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
};

test("the sidebar collapses with its handle, keeps names and tooltips, and remembers", async ({ page }) => {
  await page.goto("/live");
  const collapse = page.getByRole("button", { name: "Collapse sidebar" });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await axeClean(page);
  await collapse.click();
  const expand = page.getByRole("button", { name: "Expand sidebar" });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  const live = page.getByRole("link", { name: "Live updates" });
  await live.focus();
  await expect(page.getByRole("tooltip").filter({ hasText: "Live updates" })).toBeVisible();
  await axeClean(page);
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await page.getByRole("button", { name: "Expand sidebar" }).click();   // leave it open for other tests
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
});

test("the sidebar doesn't slide with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/live");
  const aside = page.locator("aside").filter({ has: page.getByRole("navigation", { name: "Main" }) });
  // globals.css turns every transition into 0.01 ms under reduced motion: effectively none.
  expect(parseFloat(await aside.evaluate((el) => getComputedStyle(el).transitionDuration))).toBeLessThan(0.001);
});

test("the route panel has the same handle", async ({ page }) => {
  await page.goto("/route?from=mq-station&to=library");
  const aside = page.getByRole("complementary", { name: "Route details" });
  await expect(aside).toBeVisible();
  await page.getByRole("button", { name: "Hide route details" }).click();
  await expect(aside).toBeHidden();
  await page.getByRole("button", { name: "Show route details" }).click();
  await expect(aside).toBeVisible();
});
