import { expect, test } from "@playwright/test";
import { openDetails } from "./helpers";
import AxeBuilder from "@axe-core/playwright";


// Public transport options come from the mock Transport for NSW server (tests/e2e/tfnsw-mock.mjs).
test("choose a public transport option; the URL keeps the choice", async ({ page }) => {
  await page.goto("/route?from=library&to=mortarboard-cafe");
  await openDetails(page);
  const options = page.getByRole("group", { name: "Ways to get there" });
  await expect(options.getByRole("radio")).toHaveCount(2, { timeout: 20_000 });

  await options.getByRole("radio", { name: /Bus 141/ }).check();
  await expect(page).toHaveURL(/option=transit-0/);
  const aside = page.getByRole("complementary", { name: "Route details" });
  await expect(aside.getByText("Bus 141 towards Manly")).toBeVisible();
  await expect(aside.getByText(/Stand A · departs/)).toBeVisible();

  await page.reload();
  await openDetails(page);
  await expect(page.getByRole("group", { name: "Ways to get there" }).getByRole("radio", { name: /Bus 141/ })).toBeChecked();
  await expect(aside.getByText("Bus 141 towards Manly")).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
