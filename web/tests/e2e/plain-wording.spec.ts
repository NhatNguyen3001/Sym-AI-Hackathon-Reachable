import { expect, test } from "@playwright/test";
import { openDetails } from "./helpers";

// Plain wording (cycle 6): how hard a stretch is for you, and whether to trust it. The demo trip has slopes of up to
// 2% and 3%; the default profile (manual wheelchair) manages up to 5%, so 2% is easy and 3% is a bit tiring.

test("route steps say how hard each stretch is for you, with no percentages", async ({ page }) => {
  await page.goto("/route?from=mq-station&to=library");
  await openDetails(page);
  const steps = page.getByRole("complementary", { name: "Route details" }).getByRole("list").filter({ hasText: /about \d+ m/ }).first();
  await expect(steps).toBeVisible({ timeout: 20_000 });
  await expect(steps.getByText(/Easy slope|A bit tiring/).first()).toBeVisible();
  expect(await steps.textContent()).not.toMatch(/%/);
  await expect(steps.getByText(/Checked today|Measured|Probably OK|We don't know/).first()).toBeVisible();
});

test("the voice says the same words as the screen", async ({ page }) => {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __said: string[] }).__said = log;
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak: (u: SpeechSynthesisUtterance) => log.push(u.text), cancel: () => {}, resume: () => {} },
    });
  });
  await page.goto("/route?from=mq-station&to=library");
  const start = page.getByRole("button", { name: "Start" }).filter({ visible: true });
  await expect(start).toBeVisible({ timeout: 20_000 });
  await start.click();
  await page.getByRole("button", { name: "Preview the walk" }).click();
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __said: string[] }).__said)).join(" | "),
    { timeout: 45_000 }).toMatch(/Easy slope ahead|A tiring slope ahead|Go straight for about \d+ metres/);
  const said = (await page.evaluate(() => (window as unknown as { __said: string[] }).__said)).join(" | ");
  expect(said).not.toMatch(/%|percent|footpath/);
});

test("the destination check for a public-map place says 'Probably OK' and where it's from", async ({ page }) => {
  await page.goto("/route?from=mq-station&to=place%3Aosm-n900001");
  await openDetails(page);
  const check = page.getByRole("region", { name: /Destination check/ });
  await expect(check.getByText("Probably OK").first()).toBeVisible({ timeout: 20_000 });
  await expect(check.getByText(/OpenStreetMap, \d+ \w+/).first()).toBeVisible();
  expect(await check.textContent()).not.toMatch(/\bLikely\b/);
});

test("station lifts say 'Not working', and the route badge never says 'Some details not sure'", async ({ page }) => {
  await page.goto("/route?from=mq-station&to=library");
  await openDetails(page);
  const lifts = page.getByRole("region", { name: "Station lifts" });
  await expect(lifts.getByText(/South exit lift: Not working/)).toBeVisible({ timeout: 20_000 });
  expect(await lifts.textContent()).not.toMatch(/Out of service/);
  await expect(page.getByText("Some details not sure")).toHaveCount(0);
});

test("Live updates uses the same three words in the key and on each update", async ({ page }) => {
  await page.goto("/live");
  const key = page.getByRole("region", { name: "How to read an update" });
  for (const word of ["In effect", "Someone reported this", "Cleared"]) await expect(key.getByText(word, { exact: true })).toBeVisible();
  await expect(page.getByText("Unconfirmed")).toHaveCount(0);
});
