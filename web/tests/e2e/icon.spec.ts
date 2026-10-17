import { expect, test } from "@playwright/test";

// The browser tab shows the Reachable pin, not the default Next.js favicon.
test("the tab icon is the Reachable pin", async ({ page, request }) => {
  await page.goto("/live");
  const hrefs = await page.locator('link[rel="icon"]').evaluateAll((ls) => ls.map((l) => l.getAttribute("href") ?? ""));
  expect(hrefs.some((h) => h.includes("favicon.ico"))).toBe(false);
  const icon = hrefs.find((h) => h.includes("/icon"));
  expect(icon).toBeTruthy();
  const res = await request.get(new URL(icon!, page.url()).toString());
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect(apple).toContain("/apple-icon");
});
