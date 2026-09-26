import { expect, type Page } from "@playwright/test";

export const addButton = (page: Page) => page.getByRole("link", { name: "Ghi nợ" });
export const payButton = (page: Page) => page.getByRole("link", { name: "Trừ nợ" });
export const debtorList = (page: Page) => page.getByTestId("debtor-list");

/** Mở màn chính và chờ app hydrate xong (đã đọc IndexedDB). */
export async function openHome(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("total")).not.toHaveText("—");
}

/**
 * Ghi nợ từ màn chính. `create` = chạm dòng "+ Tạo mới"; `pick` = chạm gợi ý có tên đó;
 * mặc định không chạm gì (để app tự ghép tên).
 */
export async function addDebtFlow(
  page: Page,
  name: string,
  thousands: string,
  opts: { create?: boolean; note?: string; pick?: string } = {},
) {
  await addButton(page).click();
  await expect(page).toHaveURL(/\/ghi\/$/);
  const nameInput = page.locator("#name");
  await expect(nameInput).toBeFocused();
  await nameInput.fill(name);
  if (opts.create) await page.getByRole("option", { name: /Tạo mới/ }).click();
  if (opts.pick) await page.getByRole("option", { name: new RegExp(opts.pick) }).first().click();
  if (opts.note !== undefined) await page.getByLabel("Ghi chú phân biệt").fill(opts.note);
  await page.locator("#amount").fill(thousands);
  await page.getByRole("button", { name: "Lưu" }).click();
}

export function rowFor(page: Page, name: string) {
  return debtorList(page).getByRole("link").filter({ hasText: name });
}
