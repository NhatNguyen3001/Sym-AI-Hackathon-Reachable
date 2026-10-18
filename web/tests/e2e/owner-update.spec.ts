import { expect, test } from "@playwright/test";

// The e2e API runs a fake map agent (MAP_AGENT_FAKE) with the test-only owner key "e2e-owner".

async function unlock(page: import("@playwright/test").Page, key: string) {
  await page.getByRole("button", { name: "Owner" }).click();
  await page.getByLabel("Owner key").fill(key);
  await page.getByRole("button", { name: "Unlock" }).click();
}

test("visitors see when the map was updated, but no update button", async ({ page }) => {
  await page.goto("/live");
  await expect(page.getByText(/OpenStreetMap places from|Places and roadworks updated/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Update map now" })).toHaveCount(0);
});

test("a wrong key doesn't work", async ({ page }) => {
  await page.goto("/live");
  await unlock(page, "not-the-key");
  await page.getByRole("button", { name: "Update map now" }).click();
  await expect(page.getByText("That key didn't work.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Update map now" })).toHaveCount(0);
  expect(page.url()).not.toContain("not-the-key");
});

test("the owner updates the map", async ({ page }) => {
  await page.goto("/live");
  await unlock(page, "e2e-owner");
  expect(page.url()).not.toContain("e2e-owner");
  await page.getByRole("button", { name: "Update map now" }).click();
  await expect(page.getByText(/Places and roadworks updated today/).first()).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByRole("button", { name: "Update map now" })).toBeVisible(); // remembered on this device
});

test("when updates are paused the button says so", async ({ page }) => {
  await page.route("**/agents/map/status", async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), paused: true } });
  });
  await page.goto("/live");
  await unlock(page, "e2e-owner");
  await expect(page.getByRole("button", { name: "Map updates are paused" })).toBeDisabled();
});
