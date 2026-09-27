import { expect, type Page } from "@playwright/test";

let counter = 0;
/** SĐT/email riêng cho mỗi test — mọi test dùng chung một DB trong bộ nhớ. */
export function newAccount() {
  counter += 1;
  const n = `${Date.now() % 1_000_000}${process.pid % 100}${counter}`.slice(-8).padStart(8, "0");
  return { phone: `09${n}`, email: `u${n}@example.com`, password: "123456" };
}

export type Account = ReturnType<typeof newAccount>;

/** Mã OTP mới nhất gửi tới email (hộp thư giả của server e2e). */
export async function otpFor(page: Page, email: string, previousCount = 0): Promise<string> {
  let otp: string | null = null;
  await expect
    .poll(async () => {
      const res = await page.request.get(`/api/test/outbox?to=${encodeURIComponent(email)}`);
      const body = (await res.json()) as { otp: string | null; count: number };
      otp = body.count > previousCount ? body.otp : null;
      return otp;
    })
    .not.toBeNull();
  return otp!;
}

export async function register(page: Page, acc: Account) {
  await page.goto("/dang-ky/");
  await page.getByLabel("Số điện thoại").fill(acc.phone);
  await page.getByLabel("Email").fill(acc.email);
  await page.locator('input[name="password"]').fill(acc.password);
  await page.locator('input[name="confirmPassword"]').fill(acc.password);
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByTestId("otp-step")).toBeVisible();
  await page.getByTestId("otp-input").fill(await otpFor(page, acc.email));
  // Đúng màn chính (không phải "/dang-ky/" — cũng kết thúc bằng "/").
  await expect(page).toHaveURL(/:\d+\/$/);
}

export async function login(page: Page, acc: Pick<Account, "phone" | "password">) {
  await page.goto("/dang-nhap/");
  await page.getByLabel("Số điện thoại").fill(acc.phone);
  await page.locator('input[name="password"]').fill(acc.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

/** Mở menu và bấm "Đồng bộ ngay", chờ tới khi đã đồng bộ hết. */
export async function syncNow(page: Page) {
  await page.getByRole("button", { name: "Menu" }).click();
  const account = page.getByTestId("account");
  await expect(account).toBeVisible();
  await account.getByRole("button", { name: "Đồng bộ ngay" }).click();
  await expect(page.getByTestId("sync-status")).toHaveText("Đã đồng bộ", { timeout: 15_000 });
  await page.getByTestId("menu-close").click();
}
