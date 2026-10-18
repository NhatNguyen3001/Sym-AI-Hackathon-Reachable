import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openDetails } from "./helpers";

/** Both ends of the trip are inside the map, and not hidden under the phone's route sheet. */
async function bothEndsInView(page: Page) {
  const map = await page.getByRole("region", { name: "Route map" }).boundingBox();
  const sheet = await page.getByRole("complementary", { name: "Route details" }).boundingBox();
  const narrow = (page.viewportSize()?.width ?? 1440) < 1024;
  for (const cls of ["route-start", "route-end"]) {
    const box = await page.locator(`path.${cls}`).first().boundingBox();
    expect(box, `${cls} is drawn`).not.toBeNull();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;
    expect(cx).toBeGreaterThan(map!.x);
    expect(cx).toBeLessThan(map!.x + map!.width);
    expect(cy).toBeGreaterThan(map!.y);
    expect(cy).toBeLessThan(narrow && sheet ? sheet.y : map!.y + map!.height);
  }
}

test("the whole campus trip is in view", async ({ page }) => {
  await page.goto("/route?from=mq-station&to=library");
  await expect(page.locator(".leaflet-overlay-pane path").nth(3)).toBeAttached({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await bothEndsInView(page);
});

test("the whole public transport trip is in view", async ({ page }) => {
  await page.goto("/route?from=library&to=mortarboard-cafe&option=transit-0");
  await openDetails(page);
  await expect(page.getByText("Bus 141 towards Manly")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await bothEndsInView(page);
});

test("the explore map opens on campus even when a lift is out across Sydney", async ({ page, request }) => {
  await request.post("http://localhost:8300/_mock/lifts", {
    data: { osmIds: [9756349250], stops: [{ id: "200060", text: "Central Station lift is not available" }] },
  });
  try {
    await page.waitForTimeout(2500); // the API polls lift alerts every second in e2e
    await page.goto("/");
    const region = page.getByRole("region", { name: "Live map" });
    await expect(page.getByRole("button", { name: /Lift out/ }).first()).toBeAttached({ timeout: 20_000 });
    await page.waitForTimeout(800);
    const lat = Number(await region.getAttribute("data-lat"));
    const lng = Number(await region.getAttribute("data-lng"));
    const zoom = Number(await region.getAttribute("data-zoom"));
    expect(Math.abs(lat - -33.7755)).toBeLessThan(0.003);
    expect(Math.abs(lng - 151.1155)).toBeLessThan(0.003);
    expect(zoom).toBeGreaterThanOrEqual(17);
  } finally {
    await request.post("http://localhost:8300/_mock/lifts", { data: { osmIds: [9756349250], stops: [] } });
  }
});
