import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const QUESTIONS = [
  "Do you track where I go?",
  "What's kept on my phone?",
  "What do you keep about barrier reports?",
  "Who sees my photo?",
  "Which services see my data?",
  "How do I delete my data?",
];

test("privacy is plain questions you open one at a time", async ({ page }) => {
  await page.goto("/privacy");
  for (const q of QUESTIONS) await expect(page.getByRole("button", { name: q })).toBeVisible();
  const first = page.getByRole("button", { name: QUESTIONS[0] });
  await expect(first).toHaveAttribute("aria-expanded", "true");                // the first one starts open
  await expect(page.getByText(/isn't stored/)).toBeVisible();

  const photo = page.getByRole("button", { name: "Who sees my photo?" });
  await expect(photo).toHaveAttribute("aria-expanded", "false");
  await photo.focus();
  await page.keyboard.press("Enter");
  await expect(photo).toHaveAttribute("aria-expanded", "true");
  const answer = page.locator(`[id="${await photo.getAttribute("aria-controls")}"]`);
  await expect(answer.getByText(/Claude by Anthropic/)).toBeVisible();
  await page.keyboard.press("Space");
  await expect(photo).toHaveAttribute("aria-expanded", "false");

  const reports = page.getByRole("button", { name: "What do you keep about barrier reports?" });
  await reports.click();
  await expect(page.getByText(/until the barrier is fixed/)).toHaveCount(0);   // reports aren't deleted automatically
  await expect(page.getByText(/kept so they keep helping/)).toBeVisible();

  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);
});
