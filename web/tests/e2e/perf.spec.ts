import { expect, test } from "@playwright/test";

// Before/after measurement, not part of the normal run (tagged @perf, excluded in playwright.config.ts).
// Against the dev servers: E2E_PERF=1 E2E_BASE_URL=http://localhost:3000 npx playwright test --grep @perf --project=desktop
const BASE = process.env.E2E_BASE_URL;

test("route page load @perf", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    new PerformanceObserver((list) => list.getEntries().forEach((e) => w.__long.push(e.duration)))
      .observe({ type: "longtask", buffered: true });
  });
  const counts = { route: 0, places: 0 };
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (r.method() === "POST" && u.pathname === "/route") counts.route++;
    if (u.pathname.startsWith("/places/")) counts.places++;
  });
  const start = Date.now();
  await page.goto(`${BASE ?? ""}/route?from=mq-station&to=library`);
  await expect(page.locator(".leaflet-overlay-pane path").first()).toBeAttached({ timeout: 30_000 });
  const routeShownMs = Date.now() - start;
  await page.waitForTimeout(1500);
  const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
  const longest = Math.round(Math.max(0, ...long));
  console.log(JSON.stringify({ routeShownMs, longestTaskMs: longest, totalLongTaskMs: Math.round(long.reduce((a, b) => a + b, 0)), ...counts }));
  if (process.env.PERF_ASSERT) expect(longest).toBeLessThan(200);
});
