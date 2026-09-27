// @vitest-environment node
// Kết quả spike (task 2.3) giữ lại làm test hồi quy: nếu nâng cấp Better Auth làm đổi các hành vi
// mà /api/account/* dựa vào (design D3) thì test này báo ngay.
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { createAuth } from "./auth";
import { createPgliteDb } from "./db/pglite";
import * as schema from "./db/schema";
import { MemoryMailer } from "./mail";

it("Better Auth: đăng ký kèm SĐT, OTP email, đăng nhập bằng SĐT, đặt lại mật khẩu thu hồi phiên", async () => {
  const db = await createPgliteDb();
  const mailer = new MemoryMailer();
  const auth = createAuth({ db, mailer, secret: "x".repeat(32), baseURL: "http://localhost:3100" });
  const email = "lan@example.com";
  const phone = "+84912345678";

  // Đăng ký nhận luôn phoneNumber trong body, và gửi OTP kích hoạt qua email.
  await auth.api.signUpEmail({ body: { email, password: "123456", name: phone, phoneNumber: phone } as never });
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  expect(u.phoneNumber).toBe(phone);
  expect(u.emailVerified).toBe(false);
  expect(mailer.lastOtp(email)).toMatch(/^\d{6}$/);

  // Lưu ý: signInPhoneNumber KHÔNG tự chặn email chưa xác nhận → /api/account/login phải tự kiểm tra.
  await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: phone, password: "123456" } })).resolves.toBeTruthy();

  const verified = await auth.api.verifyEmailOTP({ body: { email, otp: mailer.lastOtp(email)! }, returnHeaders: true });
  expect(verified.headers.get("set-cookie")).toContain("session_token");

  await auth.api.requestPasswordResetEmailOTP({ body: { email } });
  await auth.api.resetPasswordEmailOTP({ body: { email, otp: mailer.lastOtp(email)!, password: "654321" } });
  await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: phone, password: "123456" } })).rejects.toThrow();
  // revokeSessionsOnPasswordReset: mọi phiên cũ bị xoá.
  expect(await db.select().from(schema.session)).toHaveLength(0);
  const again = await auth.api.signInPhoneNumber({ body: { phoneNumber: phone, password: "654321" }, returnHeaders: true });
  expect(again.headers.get("set-cookie")).toContain("session_token");
});
