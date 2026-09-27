import { expect, test, type Browser, type Page } from "@playwright/test";
import { newAccount, otpFor, register, type Account } from "./account-helpers";
import { addButton, openHome, payButton } from "./helpers";

async function device(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, locale: "vi-VN" });
  return { ctx, page: await ctx.newPage() };
}

/** Đúng màn chính "/" (regex /\/$/ cũng khớp "/chia-tien/"). */
const HOME = /:\d+\/$/;

async function logoutKeep(page: Page) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByTestId("account").getByRole("button", { name: "Đăng xuất" }).click();
  await page.getByRole("button", { name: "Giữ sổ trên máy" }).click();
  await expect(page.getByRole("status")).toContainText("Đã đăng xuất");
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

/** Đăng ký trên màn đang mở (đã có sẵn ?next=): điền form, nhập OTP. */
async function registerHere(page: Page, acc: Account) {
  await page.getByLabel("Số điện thoại").fill(acc.phone);
  await page.getByLabel("Email").fill(acc.email);
  await page.locator('input[name="password"]').fill(acc.password);
  await page.locator('input[name="confirmPassword"]').fill(acc.password);
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await page.getByTestId("otp-input").fill(await otpFor(page, acc.email));
}

async function createGroup(page: Page, name: string, self: string) {
  await page.goto("/chia-tien/");
  await page.getByRole("button", { name: "+ Tạo nhóm" }).click();
  await page.getByLabel("Tên nhóm").fill(name);
  await page.getByLabel("Tên của bạn trong nhóm").fill(self);
  await page.getByRole("button", { name: "Tạo", exact: true }).click();
  await expect(page).toHaveURL(/\/chia-tien\/nhom\/\?id=/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function addGuest(page: Page, name: string, shares = 1) {
  await tab(page, "Thành viên").click();
  const form = page.getByTestId("add-guest");
  await form.getByLabel("Tên").fill(name);
  for (let i = 1; i < shares; i++) await form.getByRole("button", { name: "Số suất +" }).click();
  await form.getByRole("button", { name: "Thêm" }).click();
  await expect(page.getByTestId("member-row").filter({ hasText: name })).toBeVisible();
}

/** Thêm món: chỉ tích `only` (mặc định cả nhóm). */
async function addExpense(page: Page, title: string, thousands: string, payer: string, only?: string[]) {
  await tab(page, "Chi tiêu").click();
  await page.getByRole("link", { name: "+ Thêm món" }).click();
  await expect(page.locator("#title")).toBeFocused();
  await page.locator("#title").fill(title);
  await page.locator("#amount").fill(thousands);
  await page.getByTestId("payer").getByRole("button", { name: payer }).click();
  if (only) {
    const rows = page.getByTestId("participants").locator("li");
    for (let i = 0; i < (await rows.count()); i++) {
      const row = rows.nth(i);
      const box = row.getByRole("checkbox");
      const want = only.includes((await row.locator("span.truncate").first().textContent()) ?? "");
      if ((await box.isChecked()) !== want) await box.click();
    }
  }
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page).toHaveURL(/\/chia-tien\/nhom\//);
  await expect(page.getByTestId("item-list")).toContainText(title);
}

test("công tắc chế độ: vừa màn nhỏ, nhớ chế độ lần cuối, lần đầu vào Ghi nợ", async ({ page }) => {
  await openHome(page);
  await expect(page.getByTestId("mode-switch")).toBeInViewport();
  await expect(addButton(page)).toBeInViewport({ ratio: 1 });
  await expect(payButton(page)).toBeInViewport({ ratio: 1 });
  await expect(tab(page, "Ghi nợ")).toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: "test-results/mode-switch.png" });

  await tab(page, "Chia tiền").click();
  await expect(page).toHaveURL(/\/chia-tien\/$/);
  await expect(page.getByTestId("split-login")).toContainText("Đăng nhập để chia tiền với bạn bè");
  await expect(page.getByRole("button", { name: "+ Tạo nhóm" })).toHaveCount(0);

  // Mở lại app từ "/" → vào thẳng Chia tiền
  await page.goto("/");
  await expect(page).toHaveURL(/\/chia-tien\/$/);
  await expect(tab(page, "Chia tiền")).toHaveAttribute("aria-selected", "true");

  await tab(page, "Ghi nợ").click();
  await expect(page).toHaveURL(HOME);
  await page.reload();
  await expect(page).toHaveURL(HOME);
  await expect(addButton(page)).toBeVisible();
});

test("đăng nhập từ màn Chia tiền quay lại Chia tiền; ?next ra ngoài bị bỏ qua", async ({ page }) => {
  const acc = newAccount();
  await register(page, acc);
  await logoutKeep(page);

  await page.goto("/chia-tien/");
  await page.getByTestId("split-login").getByRole("link", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/dang-nhap\/\?next=/);
  await page.getByLabel("Số điện thoại").fill(acc.phone);
  await page.locator('input[name="password"]').fill(acc.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/chia-tien\/$/);
  await expect(page.getByRole("button", { name: "+ Tạo nhóm" })).toBeVisible();

  await page.goto("/");
  await tab(page, "Ghi nợ").click();
  await logoutKeep(page);
  await page.goto("/dang-nhap/?next=//evil.example.com");
  await page.getByLabel("Số điện thoại").fill(acc.phone);
  await page.locator('input[name="password"]').fill(acc.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(HOME);
});

test("chuyến đi trong ghi chú: kết quả Nhà T → Nhà Hùng 216.000, đánh dấu đã trả thì Đã xong", async ({ page }) => {
  await register(page, newAccount());
  await createGroup(page, "Đà Lạt", "Nhà T");
  await tab(page, "Thành viên").click();
  const me = page.getByTestId("member-row").filter({ hasText: "Nhà T" });
  await me.getByRole("button", { name: "Sửa" }).click();
  await me.getByRole("button", { name: "Số suất +" }).click();
  await me.getByRole("button", { name: "Lưu" }).click();
  await expect(me).toContainText("2 suất");
  await addGuest(page, "Nhà Hùng", 2);

  await addExpense(page, "Bún đậu", "54", "Nhà T", ["Nhà Hùng"]);
  await addExpense(page, "Kem dừa", "80", "Nhà T", ["Nhà Hùng"]);
  await addExpense(page, "Cá", "90", "Nhà T", ["Nhà Hùng"]);
  await addExpense(page, "Lẩu + nước", "700", "Nhà Hùng");
  await addExpense(page, "Vịt", "180", "Nhà Hùng");

  await tab(page, "Kết quả").click();
  const transfers = page.getByTestId("transfer");
  await expect(transfers).toHaveCount(1);
  await expect(transfers.first()).toContainText("Nhà T → Nhà Hùng");
  await expect(transfers.first()).toContainText("216.000 đ");
  await page.screenshot({ path: "test-results/group-result.png" });

  // Trả một phần rồi trả nốt
  await transfers.first().getByRole("button", { name: "Đánh dấu đã trả" }).click();
  await page.locator("#paid").fill("100");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(transfers.first()).toContainText("116.000 đ");
  await transfers.first().getByRole("button", { name: "Đánh dấu đã trả" }).click();
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByTestId("settled")).toHaveText("Đã xong ✓");

  await page.goto("/chia-tien/");
  await expect(page.getByTestId("group-list")).toContainText("Đã xong ✓");

  // Lịch sử có đủ thay đổi
  await page.getByTestId("group-list").getByRole("link", { name: /Đà Lạt/ }).click();
  await tab(page, "Lịch sử").click();
  await expect(page.getByTestId("group-history")).toContainText("Nhà T thêm Vịt 180.000 đ");
});

test("sửa, xoá kèm hoàn tác, khôi phục món; xoá khách đã dính món thì báo lý do", async ({ page }) => {
  await register(page, newAccount());
  await createGroup(page, "Ăn tối", "An");
  await addGuest(page, "Bình");
  await addExpense(page, "Pizza", "300", "An");

  await page.getByTestId("item-row").filter({ hasText: "Pizza" }).click();
  await page.locator("#amount").fill("360");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByTestId("item-list")).toContainText("360.000 đ");

  await page.getByTestId("item-row").filter({ hasText: "Pizza" }).click();
  await expect(page.getByTestId("item-history")).toContainText("số tiền 300.000 đ → 360.000 đ");
  await page.getByRole("button", { name: "Xoá món" }).click();
  await expect(page.getByRole("status")).toContainText("Đã xoá “Pizza”");
  await page.getByRole("status").getByRole("button", { name: "Hoàn tác" }).click();
  await expect(page.getByTestId("item-list")).toContainText("Pizza");

  await tab(page, "Thành viên").click();
  const binh = page.getByTestId("member-row").filter({ hasText: "Bình" });
  await binh.getByRole("button", { name: "Sửa" }).click();
  await binh.getByRole("button", { name: "Xoá khỏi nhóm" }).click();
  await expect(binh.getByTestId("group-error")).toContainText("Không xoá được");
});

test("offline: mở nhóm đã có và thêm món ở chế độ máy bay", async ({ page, context }) => {
  await register(page, newAccount());
  await createGroup(page, "Cafe", "An");
  await addGuest(page, "Bình");
  const url = page.url();
  // Chờ service worker điều khiển trang (đã precache các trang Chia tiền).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
    }
  });
  await context.setOffline(true);
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Cafe" })).toBeVisible();
  await addExpense(page, "Bạc xỉu", "58", "An");
  await tab(page, "Kết quả").click();
  await expect(page.getByTestId("transfer")).toContainText("Bình → An");
  await expect(page.getByTestId("transfer")).toContainText("29.000 đ");
  await context.setOffline(false);
});

test("hai người: mời qua link, nhận vị trí khách, cùng ghi, trả hết rồi rời; đổi link thì link cũ hết hiệu lực", async ({ browser }) => {
  const A = await device(browser);
  await register(A.page, newAccount());
  await createGroup(A.page, "Đà Lạt", "An");
  await addGuest(A.page, "Hùng");
  await addExpense(A.page, "Vịt", "180", "Hùng");

  await A.page.getByRole("button", { name: "Mời bạn" }).click();
  const link = (await A.page.getByTestId("invite-url").textContent())!;
  expect(link).toMatch(/\/chia-tien\/tham-gia\/#[\w-]{40,}$/);
  await A.page.getByRole("button", { name: "Đóng" }).last().click();

  // Hùng mở link khi chưa có tài khoản → đăng ký → quay lại màn vào nhóm
  const B = await device(browser);
  await B.page.goto(link);
  await B.page.getByTestId("join-login").getByRole("link", { name: "Đăng nhập" }).click();
  await B.page.getByRole("link", { name: "Đăng ký" }).click();
  await expect(B.page).toHaveURL(/\/dang-ky\/\?next=/);
  await registerHere(B.page, newAccount());
  await expect(B.page).toHaveURL(/\/chia-tien\/tham-gia\/$/);
  await B.page.getByLabel("Tôi là Hùng").check();
  await B.page.getByRole("button", { name: "Vào nhóm" }).click();
  await expect(B.page).toHaveURL(/\/chia-tien\/nhom\/\?id=/);
  await expect(B.page.getByTestId("item-list")).toContainText("Vịt");
  await tab(B.page, "Thành viên").click();
  await expect(B.page.getByTestId("member-row").filter({ hasText: "Hùng" })).toContainText("Bạn");

  // Hùng thêm món → An thấy khi mở lại nhóm
  await addExpense(B.page, "Xăng", "100", "Hùng");
  await expect.poll(async () => {
    await A.page.reload();
    return (await A.page.getByTestId("item-list").textContent()) ?? "";
  }, { timeout: 20_000 }).toContain("Xăng");

  // An trả hết cho Hùng, Hùng rời nhóm
  await tab(A.page, "Kết quả").click();
  await A.page.getByTestId("transfer").first().getByRole("button", { name: "Đánh dấu đã trả" }).click();
  await A.page.getByRole("button", { name: "Lưu" }).click();
  await expect(A.page.getByTestId("settled")).toBeVisible();
  await expect.poll(async () => {
    await B.page.reload();
    await tab(B.page, "Kết quả").click();
    return B.page.getByTestId("settled").isVisible();
  }, { timeout: 20_000 }).toBe(true);
  await tab(B.page, "Thành viên").click();
  await B.page.getByRole("button", { name: "Rời nhóm" }).click();
  await B.page.getByTestId("leave-confirm").getByRole("button", { name: "Rời nhóm" }).click();
  await expect(B.page).toHaveURL(/\/chia-tien\/$/);
  await expect(B.page.getByTestId("group-list")).toHaveCount(0);

  // An đổi link → link cũ không vào được
  await A.page.getByRole("button", { name: "Mời bạn" }).click();
  await A.page.getByRole("button", { name: "Đổi link mời" }).click();
  await A.page.getByRole("dialog").getByRole("button", { name: "Đổi link mời" }).last().click();
  await expect(A.page.getByTestId("invite-url")).not.toHaveText(link);
  const C = await device(browser);
  await register(C.page, newAccount());
  await C.page.goto(link);
  await expect(C.page.getByTestId("group-error")).toContainText("Link mời không còn hiệu lực");
  for (const d of [A, B, C]) await d.ctx.close();
});
