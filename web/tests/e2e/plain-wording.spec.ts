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

test("the needs filter asks how steep you can go, by feel, with no percentages", async ({ page }) => {
  await page.goto("/route?from=mq-station&to=library");
  await openDetails(page);
  await page.getByRole("button", { name: "Filter" }).filter({ visible: true }).first().click();
  const group = page.getByRole("group", { name: "How steep can you go?" });
  for (const c of ["Gentle only", "Some hills", "Most hills"]) await expect(group.getByRole("button", { name: c })).toBeVisible();
  await expect(group.getByRole("button", { name: "Gentle only" })).toHaveAttribute("aria-pressed", "true");
  expect(await group.textContent()).not.toMatch(/%/);
  await expect(page.getByRole("button", { name: "Kerbs with no ramp" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrance without steps" })).toBeVisible();
});

test("the destination check names things plainly", async ({ page }) => {
  await page.goto("/route?from=mq-station&to=library");
  await openDetails(page);
  const check = page.getByRole("region", { name: /Destination check/ });
  await expect(check.getByText("Entrance without steps")).toBeVisible({ timeout: 20_000 });
  await expect(check.getByText("No steps inside")).toBeVisible();
});

test("the report page doesn't claim a Sym agent", async ({ page }) => {
  await page.goto("/report");
  await expect(page.getByText(/We check it against other reports and notices nearby/)).toBeVisible();
  await expect(page.getByText(/Sym agent/)).toHaveCount(0);
});

test("when the server can't be reached, the sample says it's an example, not your trip", async ({ page }) => {
  await page.route(/127\.0\.0\.1:8100\/updates/, (route) => route.abort());
  await page.goto("/live");
  await expect(page.getByText("We can't reach Reachable right now. This is an example, not live information.")).toBeVisible();
});

test("the map key calls a reported barrier a 'Reported problem'", async ({ page }) => {
  await page.goto("/");
  // Phones keep the key behind "Choose pins".
  if ((page.viewportSize()?.width ?? 1440) < 1024) await page.getByRole("button", { name: "Choose pins" }).click({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Reported problem pins" })).toBeVisible({ timeout: 20_000 });
});

test("the summary is plain, and the numbers wait under Details", async ({ page }) => {
  await page.goto("/route?from=mq-station&to=library");
  await openDetails(page);
  const summary = page.getByRole("region", { name: "Summary" });
  await expect(summary.getByText(/no steps · (easy all the way|a bit tiring in places|one hard bit|\d+ hard bits)/)).toBeVisible({ timeout: 20_000 });
  expect(await summary.textContent()).not.toMatch(/%/);
  const details = summary.getByRole("button", { name: "Details" });
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await details.click();
  await expect(summary.getByText(/Steepest bit \d+% · \d+ m/)).toBeVisible();
});

test("trip cards say 'No steps' rather than 'Step-free'", async ({ page }) => {
  await page.goto("/route?from=library&to=mortarboard-cafe&option=transit-0");
  await openDetails(page);
  const ways = page.getByRole("group", { name: "Ways to get there" });
  await expect(ways.getByText("No steps").first()).toBeVisible({ timeout: 20_000 });
  expect(await ways.textContent()).not.toMatch(/max slope|%/);
});
