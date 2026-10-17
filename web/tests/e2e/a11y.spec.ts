import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = ["/", "/route?from=mq-station&to=library", "/report", "/live", "/privacy"];

for (const path of PAGES) {
  test(`accessibility: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
    const results = await new AxeBuilder({ page }).withTags(tags).disableRules(["target-size"]).analyze();
    // Map pins move with the map and can sit partly under a fixed button for a moment: target size is checked
    // for everything except them (every other rule still checks them).
    const sized = await new AxeBuilder({ page }).withRules(["target-size"]).exclude(".leaflet-marker-pane").analyze();
    const violations = [...results.violations, ...sized.violations]
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
    expect(violations).toEqual([]);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, "no horizontal scrolling").toBe(false);
    await expect(page).toHaveTitle(/Reachable/);
    await expect(page.locator("main#main")).toHaveCount(1);
  });
}

test("every page has a unique title", async ({ page }) => {
  const titles = new Set<string>();
  for (const p of PAGES) {
    await page.goto(p);
    titles.add(await page.title());
  }
  expect(titles.size).toBe(PAGES.length);
});

test("keyboard: skip link and visible focus ring", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe("solid");
});
