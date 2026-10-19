import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { FILES, TRIPS, tripPath } from "./fixtures";

const REAL = !!process.env.SHOWCASE_REAL;
const TILE_HOST = "tile.openstreetmap.org";

/** Serve the fixture recordings, record every request, and count any location request. */
async function setup(page: Page, { dark = false } = {}) {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  if (!REAL) {
    await page.route("**/showcase/*.json", (route) => {
      const name = new URL(route.request().url()).pathname.replace(/^\/showcase\//, "").replace(/\.json$/, "");
      return name in FILES ? route.fulfill({ json: FILES[name] }) : route.fulfill({ status: 404, body: "not found" });
    });
  }
  // Map tiles are pictures the test doesn't need; answering them locally keeps the run fast and offline.
  await page.route(`https://${TILE_HOST}/**`, (route) => route.fulfill({ status: 204 }));
  await page.addInitScript((isDark) => {
    (window as unknown as { __geo: number }).__geo = 0;
    const count = () => {
      (window as unknown as { __geo: number }).__geo += 1;
      return 0;
    };
    Object.defineProperty(navigator, "geolocation", {
      value: { watchPosition: count, getCurrentPosition: count, clearWatch: () => {} },
      configurable: true,
    });
    if (isDark) localStorage.setItem("reachable-theme", "dark");
  }, dark);
  return requests;
}

const geoCalls = (page: Page) => page.evaluate(() => (window as unknown as { __geo: number }).__geo);

test("no request leaves the site and nothing asks for location", async ({ page, baseURL }) => {
  const requests = await setup(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pick a trip" }).first()).toBeVisible();
  await page.goto(tripPath(TRIPS[0]));
  await expect(page.getByText("Recorded example").first()).toBeVisible();
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(500);
  expect(await geoCalls(page)).toBe(0);
  const own = new URL(baseURL!).host;
  const elsewhere = requests.filter((u) => !u.startsWith("data:") && ![own, TILE_HOST].includes(new URL(u).host));
  expect(elsewhere).toEqual([]);
});

for (const trip of TRIPS) {
  test(`trip renders: ${trip.id}`, async ({ page }) => {
    await setup(page);
    await page.goto("/");
    await page.getByRole("link", { name: new RegExp(trip.title) }).first().click();
    await expect(page).toHaveURL(new RegExp(`trip=${trip.id}`));
    await expect(page.getByText("Recorded example").first()).toBeVisible();
    await expect(page.locator(".leaflet-overlay-pane path").first()).toBeVisible();
    await expect(page.getByText(/can't reach|couldn't plan/i)).toHaveCount(0);
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/\bago\b|Leave in/);
    if (trip.id === "opera-house" && !REAL) expect(text).toContain("(Sydney)");
  });
}

test("a link to a trip that wasn't recorded shows the trips instead", async ({ page }) => {
  await setup(page);
  await page.goto("/route?from=x&to=y");
  await expect(page.getByText("This trip isn't in the showcase. Pick one of these.")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(TRIPS[0].title) }).first()).toBeVisible();
});

test("a missing recording says it couldn't load", async ({ page }) => {
  test.skip(REAL, "fixtures only");
  await setup(page);
  await page.route("**/showcase/campus.json", (route) => route.fulfill({ status: 404, body: "gone" }));
  await page.goto(tripPath(TRIPS[0]));
  await expect(page.getByText("This example couldn't load.")).toBeVisible();
  await expect(page.getByText(/can't reach/i)).toHaveCount(0);
});

test("a saved profile is ignored and kept", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem("reachable.profile", JSON.stringify({ aid: "cane", maxSlope: 12 })));
  await page.goto(tripPath(TRIPS[0]));
  await expect(page.getByText(/Planned for: manual wheelchair/i)).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("reachable.profile") ?? "{}"));
  expect(saved.aid).toBe("cane");
});

test("live updates are recorded, with no owner controls", async ({ page }) => {
  await setup(page);
  await page.goto("/live");
  await expect(page.getByText("Recorded example").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Owner/ })).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toMatch(/\bago\b/);
});

test("reports point to the live app", async ({ page }) => {
  await setup(page);
  await page.goto("/report");
  await expect(page.getByText("Barrier reports work in the live app.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Report a barrier" })).toHaveCount(0);
});

const PAGES = () => ["/", ...TRIPS.map(tripPath), "/live", "/report", "/privacy"];
for (const dark of [false, true]) {
  test(`accessibility (${dark ? "dark" : "light"})`, async ({ page }) => {
    await setup(page, { dark });
    const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
    for (const path of PAGES()) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      const results = await new AxeBuilder({ page }).withTags(tags).disableRules(["target-size"]).analyze();
      const sized = await new AxeBuilder({ page }).withRules(["target-size"]).exclude(".leaflet-marker-pane").analyze();
      const violations = [...results.violations, ...sized.violations]
        .map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
      expect(violations).toEqual([]);
    }
  });
}

test("needs can't be saved over the visitor's own", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem("reachable.profile", JSON.stringify({ aid: "cane", maxSlope: 12 })));
  await page.goto(tripPath(TRIPS[0]));
  await expect(page.getByText("Recorded example").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save filter" })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("reachable.profile") ?? "{}").aid)).toBe("cane");
});

test("guidance on a recorded public transport trip counts down by distance, in Sydney time", async ({ page }) => {
  await setup(page);
  const trip = TRIPS.find((t) => t.id === "opera-house")!;
  // Through the picker: the real recordings' place ids differ from the fixtures'.
  await page.goto("/");
  await page.getByRole("link", { name: new RegExp(trip.title) }).first().click();
  await expect(page).toHaveURL(/trip=opera-house/);
  await page.getByRole("button", { name: "Start" }).click();
  const progress = page.getByRole("region", { name: "Trip progress" });
  await expect(progress).toBeVisible();
  const text = await progress.innerText();
  expect(text).not.toMatch(/^0 min/m);
  expect(text).toContain("(Sydney)");
  await expect(page.getByRole("button", { name: "Stop preview" })).toHaveCount(0);
});

test("the staged lift outage says it's an example on its lift row", async ({ page }) => {
  await setup(page);
  await page.goto(tripPath(TRIPS.find((t) => t.id === "lift-out")!));
  await expect(page.getByText(/Example set up for this showcase/).first()).toBeVisible();
});
