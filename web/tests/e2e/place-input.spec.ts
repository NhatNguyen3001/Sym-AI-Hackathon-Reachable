import { expect, test } from "@playwright/test";

// Regression: typing then pressing Enter quickly picked a stale suggestion. The focus search (empty query,
// all places, station first) landed after the text changed, so Enter chose "Macquarie University station"
// and the trip became station -> station.
test("Enter right after typing picks a place matching what was typed", async ({ page }) => {
  await page.goto("/plan");
  const to = page.getByRole("combobox", { name: "To" });
  await to.fill("waranara");
  await to.press("Enter");
  await expect(to).toHaveValue("Waranara Library");
  await page.getByRole("button", { name: "Find a route I can use" }).click();
  await expect(page).toHaveURL(/\/route\?from=mq-station&to=library/);
});

test("Enter with no matching place does not pick anything", async ({ page }) => {
  await page.goto("/plan");
  const to = page.getByRole("combobox", { name: "To" });
  await to.fill("zzzz no such place");
  await to.press("Enter");
  await expect(to).toHaveValue("zzzz no such place");
  await page.getByRole("button", { name: "Find a route I can use" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Pick a place from the list" })).toBeVisible();
});
