import { expect, test } from "@playwright/test";
import { addButton, addDebtFlow, openHome, payButton, rowFor } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openHome(page);
});

test("gợi ý tên không dấu; tên mới tạo người mới; tên trùng khớp gắn vào người cũ", async ({ page }) => {
  await addDebtFlow(page, "Chị Lan", "200", { create: true, note: "rau" });
  await expect(page.getByRole("status")).toHaveText(/Đã ghi 200\.000 đ cho Chị Lan/);
  await addDebtFlow(page, "Cô Lân", "100", { create: true });
  await addDebtFlow(page, "Anh Tú", "80", { create: true });

  // Gợi ý
  await addButton(page).click();
  await page.locator("#name").fill("lan");
  const options = page.getByRole("option");
  await expect(options.filter({ hasText: "Chị Lan" })).toHaveCount(1);
  await expect(options.filter({ hasText: "Cô Lân" })).toHaveCount(1);
  await expect(options.filter({ hasText: "Anh Tú" })).toHaveCount(0);
  await expect(options.filter({ hasText: "Tạo mới" })).toHaveCount(1);
  await page.screenshot({ path: "test-results/add-suggestions.png" });
  await page.goBack();

  // Gõ "chị lan" không chạm gợi ý → gắn vào Chị Lan có sẵn
  await addDebtFlow(page, "chị lan", "50");
  await expect(rowFor(page, "Chị Lan")).toHaveCount(1);
  await expect(rowFor(page, "Chị Lan")).toContainText("250.000 đ");

  // Tên mới hoàn toàn
  await addDebtFlow(page, "Bác Hùng", "80");
  await expect(rowFor(page, "Bác Hùng")).toContainText("80.000 đ");
});

test("tên trùng nhiều người thì bắt chọn", async ({ page }) => {
  await addDebtFlow(page, "Chị Lan", "10", { create: true, note: "rau" });
  await addDebtFlow(page, "Chị Lan", "20", { create: true, note: "cá" });
  await expect(rowFor(page, "Chị Lan")).toHaveCount(2);

  await addDebtFlow(page, "chi lan", "5");
  await expect(page.getByTestId("form-error")).toContainText("nhiều người cùng tên");
  await expect(page).toHaveURL(/\/ghi\/$/);
});

test("nhập tiền kiểu chợ: 50 = 50.000, nút nhanh cộng dồn, Lưu tắt khi 0 đ", async ({ page }) => {
  await addButton(page).click();
  const save = page.getByRole("button", { name: "Lưu" });
  await page.locator("#name").fill("Anh Tú");
  await expect(save).toBeDisabled();

  await page.locator("#amount").fill("50");
  await expect(page.getByTestId("amount-preview")).toHaveText("50.000 đ");
  await page.locator("#amount").fill("");
  await page.getByRole("button", { name: "+100k" }).click();
  await page.getByRole("button", { name: "+20k" }).click();
  await expect(page.getByTestId("amount-preview")).toHaveText("120.000 đ");
  await expect(save).toBeEnabled();
  await page.screenshot({ path: "test-results/add-amount.png" });

  // Lưu không cần ghi chú
  await save.click();
  await expect(rowFor(page, "Anh Tú")).toContainText("120.000 đ");
});

test("trừ nợ: không có Tạo mới, Trả hết đưa số dư về 0", async ({ page }) => {
  await addDebtFlow(page, "Cô Ba", "1200", { create: true });
  await payButton(page).click();
  await expect(page.getByRole("option", { name: /Cô Ba/ })).toBeVisible(); // gợi ý sẵn người đang nợ
  await page.locator("#name").fill("Người lạ");
  await expect(page.getByRole("option", { name: /Tạo mới/ })).toHaveCount(0);
  await page.locator("#name").fill("co ba");
  await page.getByRole("option", { name: /Cô Ba/ }).click();
  await expect(page.getByTestId("selected-person")).toContainText("1.200.000 đ");
  await page.getByRole("button", { name: /Trả hết/ }).click();
  await page.screenshot({ path: "test-results/pay.png" });
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByRole("status")).toHaveText(/Đã trừ 1\.200\.000 đ cho Cô Ba/);
  await expect(page.getByTestId("total")).toHaveText("0 đ");
});

test("trừ quá số nợ: cảnh báo, bấm Lưu lần nữa để xác nhận", async ({ page }) => {
  await addDebtFlow(page, "Anh Tú", "80", { create: true });
  await payButton(page).click();
  await page.getByRole("option", { name: /Anh Tú/ }).click();
  await page.locator("#amount").fill("100");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByTestId("form-error")).toContainText("lớn hơn số đang nợ (80.000 đ)");
  await expect(page).toHaveURL(/\/tru\/$/);
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("searchbox").fill("tu");
  await expect(rowFor(page, "Anh Tú")).toContainText("-20.000 đ");
});

test("trừ nợ người không có trong sổ thì báo lỗi", async ({ page }) => {
  await payButton(page).click();
  await page.locator("#name").fill("Người lạ");
  await page.locator("#amount").fill("10");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByTestId("form-error")).toContainText("Không có người này");
});

test("hoàn tác: số dư trở về như trước; người mới tạo biến khỏi danh sách", async ({ page }) => {
  await addDebtFlow(page, "Chị Lan", "200", { create: true });
  await addDebtFlow(page, "Chị Lan", "30", { pick: "Chị Lan" });
  await expect(rowFor(page, "Chị Lan")).toContainText("230.000 đ");
  await page.getByRole("button", { name: "Hoàn tác" }).click();
  await expect(rowFor(page, "Chị Lan")).toContainText("200.000 đ");
  await expect(page.getByRole("status")).toHaveText("Đã hoàn tác");

  await addDebtFlow(page, "Bác Hùng", "80", { create: true });
  await expect(rowFor(page, "Bác Hùng")).toHaveCount(1);
  await page.getByRole("button", { name: "Hoàn tác" }).click();
  await expect(rowFor(page, "Bác Hùng")).toHaveCount(0);
});

test.describe("chưa có service worker (lần mở đầu)", () => {
  test.use({ serviceWorkers: "block" });

  test("lưu khi mất mạng vẫn thành công và quay về màn chính", async ({ page, context }) => {
    await addButton(page).click();
    await expect(page.locator("#name")).toBeFocused();
    await context.setOffline(true);
    await page.locator("#name").fill("Anh Tú");
    await page.locator("#amount").fill("80");
    await page.getByRole("button", { name: "Lưu" }).click();
    await expect(page.getByRole("status")).toContainText("Đã ghi 80.000 đ cho Anh Tú");
    await expect(page.getByRole("button", { name: "Hoàn tác" })).toBeVisible();
    await expect(rowFor(page, "Anh Tú")).toContainText("80.000 đ");
    await context.setOffline(false);
  });
});
