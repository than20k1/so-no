import { expect, test, type Browser } from "@playwright/test";
import { login, newAccount, register, syncNow, type Account } from "./account-helpers";
import { addDebtFlow, rowFor } from "./helpers";

async function device(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, locale: "vi-VN" });
  return { ctx, page: await ctx.newPage() };
}

async function loginDevice(browser: Browser, acc: Account) {
  const d = await device(browser);
  await login(d.page, acc);
  await expect(d.page).toHaveURL(/\/$/);
  return d;
}

test("hai máy cùng ghi khi offline cho cùng người rồi có mạng: cùng số dư 120.000", async ({ browser }) => {
  const acc = newAccount();
  const A = await device(browser);
  await register(A.page, acc);
  await addDebtFlow(A.page, "Chị Lan", "100", { create: true });
  await syncNow(A.page);

  const B = await loginDevice(browser, acc);
  await expect(rowFor(B.page, "Chị Lan")).toContainText("100.000 đ", { timeout: 15_000 });

  await A.ctx.setOffline(true);
  await B.ctx.setOffline(true);
  await addDebtFlow(A.page, "Chị Lan", "30", { pick: "Chị Lan" });
  await B.page.getByRole("link", { name: "Trừ nợ" }).click();
  await B.page.locator("#name").fill("Chị Lan");
  await B.page.getByRole("option", { name: /Chị Lan/ }).first().click();
  await B.page.locator("#amount").fill("10");
  await B.page.getByRole("button", { name: "Lưu" }).click();
  await expect(rowFor(A.page, "Chị Lan")).toContainText("130.000 đ");
  await expect(rowFor(B.page, "Chị Lan")).toContainText("90.000 đ");

  // Có mạng lại: cả hai máy tự gửi thay đổi chờ (sự kiện "online"), không cần bấm gì.
  await A.ctx.setOffline(false);
  await B.ctx.setOffline(false);
  for (const d of [A, B]) {
    await d.page.getByRole("button", { name: "Menu" }).click();
    await expect(d.page.getByTestId("sync-status")).toHaveText("Đã đồng bộ", { timeout: 20_000 });
    await d.page.getByTestId("menu-close").click();
  }
  // Máy nào kéo trước khi máy kia kịp gửi thì nhận nốt ở lượt sau (tự động mỗi 60 giây, hoặc bấm Đồng bộ ngay).
  await syncNow(A.page);
  await syncNow(B.page);
  await expect(rowFor(A.page, "Chị Lan")).toContainText("120.000 đ");
  await expect(rowFor(B.page, "Chị Lan")).toContainText("120.000 đ");
  await A.ctx.close();
  await B.ctx.close();
});

test("ghi nợ ở máy A tự lên server; máy B mở lại app thấy ngay", async ({ browser }) => {
  const acc = newAccount();
  const A = await device(browser);
  await register(A.page, acc);
  const B = await loginDevice(browser, acc);

  await addDebtFlow(A.page, "Anh Tú", "50", { create: true });
  // Không bấm đồng bộ: sau khi ghi, app tự đẩy lên trong vài giây.
  await expect
    .poll(async () => {
      await B.page.reload();
      return rowFor(B.page, "Anh Tú").count();
    }, { timeout: 20_000, intervals: [2000] })
    .toBe(1);
  await expect(rowFor(B.page, "Anh Tú")).toContainText("50.000 đ");
  await A.ctx.close();
  await B.ctx.close();
});

test("máy giữ sổ tài khoản X đăng nhập tài khoản Y: hỏi, không trộn sổ", async ({ browser }) => {
  const X = newAccount();
  const Y = newAccount();
  const other = await device(browser);
  await register(other.page, Y);
  await other.ctx.close();

  const A = await device(browser);
  await register(A.page, X);
  await addDebtFlow(A.page, "Sổ của X", "10", { create: true });
  await syncNow(A.page);
  await A.page.getByRole("button", { name: "Menu" }).click();
  await A.page.getByRole("button", { name: "Đăng xuất" }).click();
  await A.page.getByRole("button", { name: "Giữ sổ trên máy" }).click();

  await login(A.page, Y);
  await expect(A.page.getByTestId("mismatch-dialog")).toBeVisible();
  await A.page.getByRole("button", { name: "Xoá sổ trên máy và tiếp tục" }).click();
  await expect(A.page).toHaveURL(/\/$/);
  await expect(A.page.getByText("Sổ còn trống")).toBeVisible();

  // Tài khoản Y không nhận sổ của X.
  const check = await loginDevice(browser, Y);
  await syncNow(check.page);
  await expect(check.page.getByText("Sổ còn trống")).toBeVisible();
  await A.ctx.close();
  await check.ctx.close();
});
