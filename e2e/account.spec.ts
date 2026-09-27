import { expect, test } from "@playwright/test";
import { login, newAccount, otpFor, register, syncNow } from "./account-helpers";
import { addDebtFlow, openHome, rowFor } from "./helpers";

test("đăng ký: sổ có sẵn trên máy lên tài khoản; máy thứ hai đăng nhập thấy cùng sổ", async ({ page, browser }) => {
  const acc = newAccount();
  await openHome(page);
  await addDebtFlow(page, "Chị Lan", "200", { create: true });
  await expect(rowFor(page, "Chị Lan")).toContainText("200.000 đ");

  await register(page, acc);
  await expect(page.getByRole("status")).toContainText("Đã đăng nhập");
  await expect(rowFor(page, "Chị Lan")).toContainText("200.000 đ");
  await syncNow(page);

  const other = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
  const p2 = await other.newPage();
  await login(p2, acc);
  await expect(p2).toHaveURL(/\/$/);
  await expect(rowFor(p2, "Chị Lan")).toContainText("200.000 đ", { timeout: 15_000 });
  await p2.screenshot({ path: "test-results/second-device.png" });
  await other.close();
});

test("đăng ký: kiểm tra tại chỗ, SĐT đã có tài khoản thì báo", async ({ page }) => {
  const acc = newAccount();
  await register(page, acc);

  await page.goto("/dang-ky/");
  await page.getByLabel("Số điện thoại").fill(acc.phone);
  await page.getByLabel("Email").fill("khac" + acc.email);
  await page.locator('input[name="password"]').fill("123456");
  await page.locator('input[name="confirmPassword"]').fill("654321");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByTestId("auth-error")).toHaveText("Hai mật khẩu không khớp.");

  await page.locator('input[name="confirmPassword"]').fill("123456");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByTestId("auth-error")).toContainText("Số này đã có tài khoản");
});

test("đăng nhập: sai 5 lần thì khoá, kể cả nhập đúng", async ({ page, browser }) => {
  const acc = newAccount();
  await register(page, acc);

  const other = await browser.newContext();
  const p2 = await other.newPage();
  for (let i = 0; i < 4; i++) {
    await login(p2, { phone: acc.phone, password: "sai-mat-khau" });
    await expect(p2.getByTestId("auth-error")).toHaveText("Số điện thoại hoặc mật khẩu không đúng.");
  }
  await login(p2, { phone: acc.phone, password: "sai-mat-khau" });
  await expect(p2.getByTestId("auth-error")).toContainText("Thử lại sau 15 phút");
  await login(p2, acc);
  await expect(p2.getByTestId("auth-error")).toContainText("Sai quá nhiều lần");
  await other.close();
});

test("quên mật khẩu: đặt lại xong máy cũ phải đăng nhập lại; mật khẩu mới dùng được", async ({ page, browser }) => {
  const acc = newAccount();
  await register(page, acc);

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto("/quen-mat-khau/");
  await p2.getByLabel("Số điện thoại").fill(acc.phone);
  await p2.getByRole("button", { name: "Gửi mã" }).click();
  await expect(p2.getByTestId("reset-step")).toContainText(acc.email.slice(0, 2) + "***@example.com");
  await p2.locator('input[name="otp"]').fill(await otpFor(p2, acc.email, 1));
  await p2.locator('input[name="password"]').fill("654321");
  await p2.locator('input[name="confirmPassword"]').fill("654321");
  await p2.getByRole("button", { name: "Xác nhận" }).click();
  await expect(p2).toHaveURL(/\/dang-nhap\/$/);
  await login(p2, { phone: acc.phone, password: "654321" });
  await expect(p2).toHaveURL(/\/$/);
  await other.close();

  // Máy cũ: phiên bị thu hồi → báo cần đăng nhập lại, sổ vẫn còn.
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByTestId("account").getByRole("button", { name: "Đồng bộ ngay" }).click();
  await expect(page.getByTestId("sync-status")).toContainText("Đăng nhập lại");
});

test("đăng xuất: giữ sổ thì sổ còn; xoá sổ khi còn thay đổi chưa gửi thì cảnh báo trước", async ({ page, context }) => {
  const acc = newAccount();
  await register(page, acc);
  await addDebtFlow(page, "Anh Tú", "80", { create: true });
  await syncNow(page);

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await page.getByRole("button", { name: "Giữ sổ trên máy" }).click();
  await expect(page.getByTestId("menu-login")).toBeVisible();
  await page.getByTestId("menu-close").click();
  await expect(rowFor(page, "Anh Tú")).toContainText("80.000 đ");

  // Đăng nhập lại, ghi khi offline rồi đăng xuất xoá sổ → phải qua cảnh báo.
  await login(page, acc);
  await expect(page).toHaveURL(/\/$/);
  await context.setOffline(true);
  await addDebtFlow(page, "Anh Tú", "20", { pick: "Anh Tú" });
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await page.getByRole("button", { name: "Xoá sổ khỏi máy" }).click();
  await expect(page.getByTestId("logout-unsynced")).toContainText("chưa gửi");
  await page.getByRole("button", { name: "Vẫn xoá" }).click();
  await page.getByTestId("menu-close").click();
  await expect(page.getByText("Sổ còn trống")).toBeVisible();
  await context.setOffline(false);
});

test("mất mạng: màn đăng nhập báo cần mạng, ghi nợ trên máy vẫn được", async ({ page, context }) => {
  await openHome(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
    }
  });
  await context.setOffline(true);
  await page.goto("/dang-nhap/");
  await expect(page.getByTestId("need-network")).toBeVisible();
  await expect(page.getByRole("button", { name: "Đăng nhập", exact: true })).toBeDisabled();
  await page.goto("/");
  await addDebtFlow(page, "Cô Ba", "30", { create: true });
  await expect(rowFor(page, "Cô Ba")).toContainText("30.000 đ");
  await context.setOffline(false);
});
