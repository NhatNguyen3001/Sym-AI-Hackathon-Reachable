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

const TFNSW = "http://localhost:8300";

test("one card per way, with Leave at chips that pick the departure", async ({ page }) => {
  await page.goto("/route?from=library&to=mortarboard-cafe");
  await openDetails(page);
  const ways = page.getByRole("group", { name: "Ways to get there" });
  await expect(ways.getByRole("radio")).toHaveCount(2, { timeout: 20_000 });   // walk + one Bus 141 card
  await ways.getByRole("radio", { name: /Bus 141/ }).check();
  const chips = ways.getByRole("button", { name: /^Leave at / });
  await expect(chips).toHaveCount(3);
  await chips.nth(1).click();
  await expect(page).toHaveURL(/option=transit-1/);
  await expect(chips.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("section[aria-labelledby=summary-h]")).toHaveCount(0);   // the card is the summary
});

test("a departure with a lift alert says so on its chip", async ({ page, request }) => {
  test.skip(test.info().project.name !== "desktop", "changes shared mock state");
  await request.post(`${TFNSW}/_mock/lifts`, { data: { osmIds: [9756349250], stops: [{ id: "2113001", text: "Library Rd Stand A lift is not available" }] } });
  try {
    await page.waitForTimeout(2500);   // the API polls the mock every second
    await page.goto("/route?from=library&to=mortarboard-cafe&option=transit-0");
    await openDetails(page);
    const chip = page.getByRole("button", { name: /^Leave at .*lift alert/ }).first();
    await expect(chip).toBeVisible({ timeout: 20_000 });
    await chip.click();
    await expect(page.getByText("Library Rd Stand A lift is not available").first()).toBeVisible();
  } finally {
    await request.post(`${TFNSW}/_mock/lifts`, { data: { osmIds: [9756349250] } });
  }
});
