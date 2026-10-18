import { expect, test } from "@playwright/test";
import { openDetails } from "./helpers";

// The library café has no accessible toilet listed. Someone who needs one should be told before they go.
test("the route warns when the destination may not meet your needs", async ({ page }) => {
  await page.addInitScript(() => {
    const p = JSON.parse(localStorage.getItem("reachable.profile") ?? "null");
    if (!p) localStorage.setItem("reachable.profile", JSON.stringify({ destination: { entrance: true, toilet: true, parking: false } }));
  });
  await page.goto("/route?from=mq-station&to=library-cafe");
  await openDetails(page);
  const aside = page.getByRole("complementary", { name: "Route details" });
  await expect(aside.getByText("This place may not meet your need for an accessible toilet.")).toBeVisible({ timeout: 15_000 });
});
