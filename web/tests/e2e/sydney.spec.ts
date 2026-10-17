import { expect, test } from "@playwright/test";

// Real Sydney stack: Valhalla in Docker + public Photon search. Run with E2E_VALHALLA=1 npx playwright test sydney
test.skip(!process.env.E2E_VALHALLA, "set E2E_VALHALLA=1 with the Valhalla container running");

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "runs once");
});

test("search Sydney places and get a step-free route with estimated slopes", async ({ page }) => {
  await page.goto("/route?from=mq-station&to=library");
  const from = page.getByRole("combobox", { name: "From" });
  await from.fill("Town Hall");
  await expect(page.getByRole("option", { name: /Town Hall/ }).first()).toBeVisible({ timeout: 10_000 });
  await from.press("Enter");

  const to = page.getByRole("combobox", { name: "To" });
  await to.fill("State Library of New South Wales");
  await expect(page.getByRole("option", { name: /State Library/ }).first()).toBeVisible({ timeout: 10_000 });
  await to.press("Enter");
  await expect(page).toHaveURL(/\/route\?from=osm%3A|\/route\?from=osm:/);
  const aside = page.getByRole("complementary", { name: "Route details" });
  await expect(aside.getByText(/ min$/).first()).toBeVisible({ timeout: 20_000 });
  await expect(aside.getByText(/slopes estimated/)).toBeVisible();
  await expect(aside.getByText(/Slopes outside the Macquarie University campus are estimates/)).toBeVisible();
});
