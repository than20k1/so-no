import { expect, test } from "@playwright/test";
import { addDebtFlow, openHome, rowFor } from "./helpers";

test("chi tiết: lịch sử mới nhất ở trên, dòng hủy vẫn hiện; Trừ nợ từ chi tiết chọn sẵn người", async ({ page }) => {
  await openHome(page);
  await addDebtFlow(page, "Chị Lan", "200", { create: true, note: "rau" });
  await addDebtFlow(page, "Chị Lan", "30", { pick: "Chị Lan" });
  await page.getByRole("button", { name: "Hoàn tác" }).click();
  await expect(rowFor(page, "Chị Lan")).toContainText("200.000 đ");

  await rowFor(page, "Chị Lan").click();
  await expect(page.getByRole("heading", { name: "Chị Lan" })).toBeVisible();
  await expect(page.getByText("rau")).toBeVisible();

  await page.getByRole("link", { name: "Trừ nợ" }).click();
  await expect(page).toHaveURL(/\/tru\/\?id=/);
  await expect(page.getByTestId("selected-person")).toContainText("Chị Lan");
  await expect(page.getByTestId("selected-person")).toContainText("200.000 đ");
  await expect(page.locator("#amount")).toBeFocused();
  await page.locator("#amount").fill("100");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page).toHaveURL(/\/$/);

  await rowFor(page, "Chị Lan").click();
  await expect(page.getByTestId("balance")).toHaveText("100.000 đ");
  const rows = page.getByTestId("history-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("− 100.000");
  await expect(rows.nth(1)).toHaveAttribute("data-voided", "true");
  await expect(rows.nth(1)).toContainText("Đã hủy lúc");
  await expect(rows.nth(2)).toContainText("+ 200.000");
  await page.screenshot({ path: "test-results/detail.png" });

  // Ghi thêm từ chi tiết cũng chọn sẵn người
  await page.getByRole("link", { name: "Ghi thêm" }).click();
  await expect(page.getByTestId("selected-person")).toContainText("Chị Lan");
});

test("menu: mở, nút quay lại đóng menu và vẫn ở màn chính; mục đăng nhập 'sắp có'", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Menu" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Menu trượt vào: vị trí ngang về 0 sau hiệu ứng.
  await expect.poll(async () => (await page.locator("nav").boundingBox())?.x).toBe(0);
  await page.screenshot({ path: "test-results/menu.png" });

  await page.goBack();
  // Đang trượt ra thì menu vẫn nằm trong DOM; sau hiệu ứng thì ẩn hẳn.
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Ghi nợ" })).toBeVisible();

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: /Đăng nhập \/ Đồng bộ/ }).click();
  await expect(page.getByRole("status")).toContainText("phiên bản sau");
  await expect(page).toHaveURL(/\/(#menu)?$/);

  // Đóng bằng chạm ra ngoài
  await page.getByTestId("menu-backdrop").click({ position: { x: 340, y: 300 } });
  await expect(dialog).toBeHidden();
});

test("đổi ngôn ngữ sang English áp dụng ngay, số tiền vẫn dạng 50.000, giữ sau khi mở lại", async ({ page }) => {
  await openHome(page);
  await addDebtFlow(page, "Anh Tú", "50", { create: true });
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("radio", { name: "English" }).click();
  await page.getByTestId("menu-close").click();

  await expect(page.getByRole("link", { name: "Add debt" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pay debt" })).toBeVisible();
  await expect(rowFor(page, "Anh Tú")).toContainText("50.000 đ");

  await page.reload();
  await expect(page.getByRole("link", { name: "Add debt" })).toBeVisible();
});
