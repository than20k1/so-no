import { expect, test } from "@playwright/test";
import { addButton, addDebtFlow, debtorList, openHome, payButton, rowFor } from "./helpers";

test("màn chính 360x640: thấy menu và hai nút lớn không cần cuộn; sổ trống có hướng dẫn", async ({ page }) => {
  await openHome(page);
  const viewport = page.viewportSize()!;
  for (const el of [page.getByRole("button", { name: "Menu" }), addButton(page), payButton(page)]) {
    await expect(el).toBeInViewport({ ratio: 1 });
    const box = (await el.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
  expect((await addButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(72);
  expect((await payButton(page).boundingBox())!.height).toBeGreaterThanOrEqual(72);
  await expect(page.getByText("Sổ còn trống")).toBeVisible();
  await page.screenshot({ path: "test-results/home-empty.png" });
});

test("danh sách: người vừa giao dịch lên đầu, người trả hết biến mất, tìm thấy lại khi tìm", async ({ page }) => {
  await openHome(page);
  await addDebtFlow(page, "Cô Ba", "1200", { create: true });
  await addDebtFlow(page, "Anh Tú", "80", { create: true });
  await expect(debtorList(page).getByRole("link").first()).toContainText("Anh Tú");

  await addDebtFlow(page, "Cô Ba", "10");
  await expect(debtorList(page).getByRole("link").first()).toContainText("Cô Ba");
  await expect(page.getByTestId("total")).toHaveText("1.290.000 đ");

  // Trả hết cho Cô Ba
  await payButton(page).click();
  await page.locator("#name").fill("ba");
  await page.getByRole("option", { name: /Cô Ba/ }).click();
  await page.getByRole("button", { name: /Trả hết/ }).click();
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(rowFor(page, "Cô Ba")).toHaveCount(0);

  await page.getByRole("searchbox").fill("ba");
  await expect(rowFor(page, "Cô Ba")).toContainText("0 đ");
  await page.screenshot({ path: "test-results/home-list.png" });
});

test("chạm một dòng mở màn chi tiết", async ({ page }) => {
  await openHome(page);
  await addDebtFlow(page, "Chị Lan", "200", { create: true, note: "rau" });
  await rowFor(page, "Chị Lan").click();
  await expect(page).toHaveURL(/\/nguoi\/\?id=/);
  await expect(page.getByTestId("balance")).toHaveText("200.000 đ");
});
