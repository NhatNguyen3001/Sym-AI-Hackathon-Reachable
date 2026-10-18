import { expect, request, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openDetails } from "./helpers";

// Review fixes for step-by-step guidance (2026-10-18). Speech is replaced by a recorder so tests can see what
// would have been said, and in what order.
const MOCK = "http://localhost:8300";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const log: string[][] = [];
    (window as unknown as { __speech: string[][] }).__speech = log;
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak: (u: SpeechSynthesisUtterance) => log.push(["speak", u.text]),
        cancel: () => log.push(["cancel"]),
        resume: () => {},
      },
    });
  });
});

const speech = (page: Page) => page.evaluate(() => (window as unknown as { __speech: string[][] }).__speech);

async function startPreview(page: Page) {
  await page.goto("/route?from=mq-station&to=library");
  const start = page.getByRole("button", { name: "Start" }).filter({ visible: true });
  await expect(start).toBeVisible({ timeout: 20_000 });
  await start.click();
  await page.getByRole("button", { name: "Preview the walk" }).click();
}

test("the route says if it's step-free, how sure we are, the lifts and the destination check", async ({ page }) => {
  await page.goto("/route?from=mq-station&to=library");
  await openDetails(page);
  const details = page.getByRole("complementary", { name: "Route details" });
  await expect(details.getByText(/step-free|has steps/).first()).toBeVisible({ timeout: 20_000 });
  await expect(details.getByText(/max slope \d+%|slopes estimated/).first()).toBeVisible();
  await expect(details.getByRole("heading", { name: "Station lifts" })).toBeVisible();
  await expect(details.getByRole("heading", { name: /Destination check/ })).toBeVisible();
});

test("Start moves focus to the directions, and End brings it back to Start", async ({ page }) => {
  await page.goto("/route?from=mq-station&to=library");
  const start = page.getByRole("button", { name: "Start" }).filter({ visible: true });
  await expect(start).toBeVisible({ timeout: 20_000 });
  await start.click();
  await expect(page.getByRole("heading", { name: "Directions" })).toBeFocused();
  await page.getByRole("button", { name: "End", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start" }).filter({ visible: true })).toBeFocused();
});

test("a muted voice stays quiet from the very start", async ({ page, context }) => {
  // A location fix is already there when Start is pressed (the case where the old code spoke once).
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -33.7765, longitude: 151.1152, accuracy: 10 });
  await page.addInitScript(() => localStorage.setItem("reachable.voice", "off"));
  await page.goto("/route?from=mq-station&to=library");
  const start = page.getByRole("button", { name: "Start" }).filter({ visible: true });
  await expect(start).toBeVisible({ timeout: 20_000 });
  await start.click();
  await expect(page.getByRole("button", { name: "End", exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  expect((await speech(page)).filter(([kind]) => kind === "speak")).toEqual([]);
});

test("each step is announced once, not on every move", async ({ page }) => {
  await startPreview(page);
  await expect(page.getByRole("region", { name: "Directions" })).not.toHaveAttribute("aria-live", /.+/);
  const status = page.getByRole("status").filter({ hasText: /^Now: / });
  await expect(status).toBeAttached();
  const first = await status.textContent();
  await page.waitForTimeout(1500); // the preview moves on a few metres: the announcement doesn't change
  await expect(status).toHaveText(first ?? "");
});

test("a new step stops speech left over from the last one", async ({ page }) => {
  await startPreview(page);
  await expect.poll(async () => (await speech(page)).filter(([k]) => k === "speak").length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);
  const log = await speech(page);
  const steps = log.map((e, i) => [e, i] as const)
    .filter(([[kind, text]]) => kind === "speak" && !/^(In \d+ metres|Turn |Keep )/.test(text ?? ""));
  for (const [, i] of steps) expect(log[i - 1]?.[0]).toBe("cancel");
});

test("if re-planning fails while guiding, the directions and End stay", async ({ page }) => {
  const api = await request.newContext();
  await startPreview(page);
  await expect(page.getByRole("heading", { name: "Directions" })).toBeAttached();
  await page.route(/\/route$/, (route) => route.abort()); // no signal (underground)
  try {
    await api.post(`${MOCK}/_mock/lifts`, { data: { osmIds: [9756349221] } }); // a lift changes: the page re-plans
    await expect(page.getByText(/Couldn't update your route/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "End", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Directions" })).toBeAttached();
  } finally {
    await api.post(`${MOCK}/_mock/lifts`, { data: { osmIds: [9756349250] } });
  }
});
