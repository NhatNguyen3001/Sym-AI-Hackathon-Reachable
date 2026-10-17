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

/** Test browsers have location off, so the map asks where the trip starts: pick the campus station. */
export async function startAtStation(page: Page) {
  const from = page.getByRole("combobox", { name: "From" }).filter({ visible: true }).first();
  await from.fill("macquarie uni");
  await page.getByRole("option", { name: /Macquarie University station/ }).filter({ visible: true }).first().click();
  await expect(from).toHaveValue("Macquarie University station");
}

/** Close the route details so the map and its buttons are free (on phones the sheet covers them). */
export async function closeDetails(page: Page) {
  await expect(page.getByRole("button", { name: SHOW }).or(page.getByRole("button", { name: HIDE })).first()).toBeVisible();
  const hide = page.getByRole("button", { name: HIDE }).filter({ visible: true }).first();
  if (await hide.isVisible()) await hide.click();
}
