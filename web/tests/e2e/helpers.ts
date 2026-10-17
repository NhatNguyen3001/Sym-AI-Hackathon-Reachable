import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const SHOW = /^(Show search|Show route details)$/;
const HIDE = /^(Hide search|Hide route details)$/;

/** Route details open by themselves while loading; open them if someone (or the page) closed them. */
export async function openDetails(page: Page) {
  await expect(page.getByRole("button", { name: SHOW }).or(page.getByRole("button", { name: HIDE })).first()).toBeVisible();
  const show = page.getByRole("button", { name: SHOW }).filter({ visible: true }).first();
  if (await show.isVisible()) await show.click();
}

/** Close the route details so the map and its buttons are free (on phones the sheet covers them). */
export async function closeDetails(page: Page) {
  await expect(page.getByRole("button", { name: SHOW }).or(page.getByRole("button", { name: HIDE })).first()).toBeVisible();
  const hide = page.getByRole("button", { name: HIDE }).filter({ visible: true }).first();
  if (await hide.isVisible()) await hide.click();
}
