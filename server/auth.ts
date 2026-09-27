import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, phoneNumber } from "better-auth/plugins";
import type { Db } from "./db/client";
import * as schema from "./db/schema";
import type { Mailer } from "./mail";

const DAY_S = 24 * 60 * 60;

export interface AuthConfig {
  db: Db;
  mailer: Mailer;
  secret: string;
  baseURL: string;
}

const OTP_SUBJECT = {
  "email-verification": "Mã kích hoạt tài khoản Sổ Nợ",
  "forget-password": "Mã đặt lại mật khẩu Sổ Nợ",
  "sign-in": "Mã đăng nhập Sổ Nợ",
} as const;

/** Lõi đăng nhập (design D3). App không gọi thẳng các endpoint này mà qua /api/account/*. */
export function createAuth({ db, mailer, secret, baseURL }: AuthConfig) {
  return betterAuth({
    secret,
    baseURL,
    basePath: "/api/auth",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
      requireEmailVerification: true,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: { autoSignInAfterVerification: true },
    session: { expiresIn: 365 * DAY_S, updateAge: DAY_S },
    rateLimit: { enabled: true, storage: "database" },
    plugins: [
      emailOTP({
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: true,
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        async sendVerificationOTP({ email, otp, type }) {
          const subject = OTP_SUBJECT[type as keyof typeof OTP_SUBJECT] ?? "Mã xác nhận Sổ Nợ";
          await mailer.send({
            to: email,
            subject,
            text: `${subject}: ${otp}\n\nMã có hiệu lực 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
          });
        },
      }),
      // Số điện thoại chỉ làm định danh đăng nhập; chưa gửi SMS (design D3).
      phoneNumber({ sendOTP: () => {} }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
