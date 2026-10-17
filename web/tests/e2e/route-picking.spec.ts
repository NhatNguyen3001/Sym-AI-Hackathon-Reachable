import { expect, request, test } from "@playwright/test";
import { openDetails } from "./helpers";
import type { Page } from "@playwright/test";

const API = "http://localhost:8100";
const TFNSW = "http://localhost:8300";
const LIFT2 = 9756349250; // south exit

// These change shared server state (the mock lift alerts), so run them once.
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "runs once");
});

async function alternatives() {
  const api = await request.newContext({ baseURL: API });
  const r = await (await api.post("/route", { data: { from: "mq-station", to: "library" } })).json();
  await api.dispose();
  return { recommended: r.accessible.minutes as number, alts: r.alternatives as { summary: string; minutes: number }[] };
}

/** How big the blue route line is on screen: zooming out shrinks it, a refit makes it big again. */
async function routeWidth(page: Page) {
  return page.evaluate(() => Math.max(...[...document.querySelectorAll<SVGPathElement>(".leaflet-overlay-pane path")]
    .filter((p) => p.getAttribute("stroke")?.toLowerCase() === "#1d4fa8")
    .map((p) => p.getBoundingClientRect().width)));
}

test("picking an alternative switches the directions; a live update goes back to the recommended route", async ({ page }) => {
  const tfnsw = await request.newContext({ baseURL: TFNSW });
  try {
    await tfnsw.post("/_mock/lifts", { data: { osmIds: [LIFT2] } });
    const { recommended, alts } = await alternatives();
    expect(alts.length).toBeGreaterThan(0);
    await page.goto("/route?from=mq-station&to=library");
    await openDetails(page);
    const summary = page.getByRole("region", { name: "Summary" }).or(page.locator("section[aria-labelledby=summary-h]"));
    await expect(summary.getByText(`${recommended} min`, { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.locator(`.leaflet-marker-icon[title="${alts[0].summary}"]`).click();
    await expect(summary.getByText(`${alts[0].minutes} min`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start" }).first()).toBeVisible();

    await tfnsw.post("/_mock/lifts", { data: { osmIds: [] } }); // a real lift change: the route reloads
    await page.waitForTimeout(2500);                              // the API polls the lift feed every second
    const after = await alternatives();
    await expect(summary.getByText(`${after.recommended} min`, { exact: true })).toBeVisible({ timeout: 10_000 });
  } finally {
    await tfnsw.post("/_mock/lifts", { data: { osmIds: [LIFT2] } });
    await tfnsw.dispose();
  }
});

test("the map keeps your zoom when the page re-renders", async ({ page }) => {
  const { alts } = await alternatives();
  await page.goto("/route?from=mq-station&to=library");
  await expect(page.locator(".leaflet-tile").first()).toBeAttached({ timeout: 15_000 });
  await openDetails(page);   // the panel is open before zooming: opening it resizes the map
  await page.locator(`.leaflet-marker-icon[title="${alts[0].summary}"]`).click();  // picking one used to refit on every render
  await page.waitForTimeout(500);
  const map = page.getByRole("region", { name: "Route map" });
  await map.getByRole("button", { name: "Zoom out" }).click();
  await map.getByRole("button", { name: "Zoom out" }).click();
  await page.waitForTimeout(800);
  const zoomed = await routeWidth(page);
  await page.getByRole("button", { name: "Filter", exact: true }).click();   // re-renders the page
  await page.waitForTimeout(800);
  expect(await routeWidth(page)).toBeCloseTo(zoomed, 0);
});
