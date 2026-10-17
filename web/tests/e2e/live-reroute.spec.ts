import { expect, request, test } from "@playwright/test";

const API = "http://localhost:8100";
const TFNSW = "http://localhost:8300";
const LIFT1 = 9756349221; // north exit
const LIFT2 = 9756349250; // south exit

// These change shared server state, so run them once (desktop project only).
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "runs once");
});

test("a live lift alert reroutes an open route page without a reload", async ({ page }) => {
  const tfnsw = await request.newContext({ baseURL: TFNSW });
  try {
    await tfnsw.post("/_mock/lifts", { data: { osmIds: [LIFT2] } });
    await page.goto("/route?from=mq-station&to=library");
    const aside = page.getByRole("complementary", { name: "Route details" });
    await expect(aside.getByText("South exit lift: Out of service")).toBeVisible({ timeout: 10_000 });
    await expect(aside.getByText("Lift at north exit")).toBeVisible();

    await tfnsw.post("/_mock/lifts", { data: { osmIds: [LIFT2, LIFT1] } });
    await expect(aside.getByText(/Every lift at Macquarie University station is out of service/)).toBeVisible({ timeout: 10_000 });

    await tfnsw.post("/_mock/lifts", { data: { osmIds: [LIFT2] } });
    await expect(aside.getByText("Lift at north exit")).toBeVisible({ timeout: 10_000 });
  } finally {
    await tfnsw.post("/_mock/lifts", { data: { osmIds: [LIFT2] } });
    await tfnsw.dispose();
  }
});

test("plan a trip with the keyboard, then report a barrier", async ({ page }) => {
  await page.goto("/plan");
  const to = page.getByRole("combobox", { name: "To" });
  await to.focus();
  await to.fill("libr");
  await expect(page.getByRole("option", { name: /Waranara Library/ })).toBeVisible();
  await to.press("Enter");
  await page.getByRole("button", { name: "Find a route I can use" }).press("Enter");
  await expect(page).toHaveURL(/\/route\?from=mq-station&to=library/);

  await page.goto("/report");
  await page.getByRole("button", { name: "Stairs" }).click();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Thanks. Your report is in.")).toBeVisible();
  await page.getByRole("link", { name: "See it on Live updates" }).click();
  await expect(page.getByRole("region", { name: "Updates" }).getByText("Stairs on the path").first()).toBeVisible();
});

test("unknown place shows a readable error", async ({ page }) => {
  await page.goto("/route?from=mq-station&to=nowhere");
  await expect(page.getByRole("alert").filter({ hasText: "We couldn't find that place" })).toBeVisible();
});

test("rain shows the weather banner on plan and route", async ({ page }) => {
  const api = await request.newContext({ baseURL: API });
  const on = await (await api.post("/demo/rain")).json();
  try {
    expect(on.raining).toBe(true);
    await page.goto("/plan");
    await expect(page.getByText("Light rain now.")).toBeVisible();
    await page.goto("/route?from=mq-station&to=library");
    await expect(page.getByText("Avoiding steep or smooth paths that get slippery.")).toBeVisible();
  } finally {
    await api.post("/demo/rain");
    await api.dispose();
  }
});
