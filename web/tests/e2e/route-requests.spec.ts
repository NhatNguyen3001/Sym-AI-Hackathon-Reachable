import { expect, test } from "@playwright/test";

// One load of the route page asks for each thing once (it used to ask for the route twice and each place up to 4x).
test("the route page requests the route and each place once", async ({ page }) => {
  const counts = { route: 0, from: 0, to: 0 };
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (r.method() === "POST" && u.pathname === "/route") counts.route++;
    if (u.pathname === "/places/mq-station") counts.from++;
    if (u.pathname === "/places/library") counts.to++;
  });
  await page.goto("/route?from=mq-station&to=library");
  await expect(page.locator(".leaflet-overlay-pane path").first()).toBeAttached({ timeout: 20_000 });
  await page.waitForTimeout(1000);
  expect(counts).toEqual({ route: 1, from: 1, to: 1 });
});
