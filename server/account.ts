// API tài khoản mà trình duyệt gọi (design D3). Bọc Better Auth để thêm: chuẩn hoá SĐT, khoá theo SĐT,
// tra email theo SĐT, không lộ tài khoản tồn tại, thông báo lỗi thống nhất.
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import type { AppEnv } from "./app";
import type { Db } from "./db/client";
import * as schema from "./db/schema";
import { normalizePhone } from "./phone";

const LOCK_AFTER_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const RESEND_GAP_MS = 60 * 1000;
const MIN_PASSWORD = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type AccountError =
  | "invalid_phone"
  | "invalid_email"
  | "password_too_short"
  | "password_mismatch"
  | "phone_taken"
  | "email_taken"
  | "invalid_otp"
  | "otp_expired"
  | "too_many_attempts"
  | "resend_too_soon"
  | "invalid_credentials"
  | "locked"
  | "email_not_verified"
  | "unauthorized";

type Ctx = Context<AppEnv>;
const fail = (c: Ctx, error: AccountError, status: 400 | 401 | 403 | 409 | 423 | 429 = 400, extra: object = {}) =>
  c.json({ error, ...extra }, status);

/** Chuyển cookie phiên mà Better Auth đặt sang response của mình. */
function forwardCookies(c: Ctx, headers: Headers) {
  for (const cookie of headers.getSetCookie()) c.header("set-cookie", cookie, { append: true });
}

function errorCode(err: unknown): string | undefined {
  return (err as { body?: { code?: string } })?.body?.code;
}

function otpError(c: Ctx, err: unknown) {
  const code = errorCode(err);
  if (code === "OTP_EXPIRED") return fail(c, "otp_expired");
  if (code === "TOO_MANY_ATTEMPTS") return fail(c, "too_many_attempts");
  if (code === "INVALID_OTP") return fail(c, "invalid_otp");
  throw err;
}

async function body<T>(c: Ctx): Promise<Partial<T>> {
  try {
    return (await c.req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

async function userByPhone(db: Db, phone: string) {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.phoneNumber, phone));
  return u;
}

async function userByEmail(db: Db, email: string) {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  return u;
}

/** Mỗi tài khoản có đúng một sổ trên server; tạo khi cần. */
export async function ensureBook(db: Db, userId: string): Promise<string> {
  await db
    .insert(schema.books)
    .values({ id: crypto.randomUUID(), ownerUserId: userId, name: "Sổ nợ", createdAt: Date.now() })
    .onConflictDoNothing({ target: schema.books.ownerUserId });
  const [book] = await db.select().from(schema.books).where(eq(schema.books.ownerUserId, userId));
  return book.id;
}

/** Gửi mã quá dày (dưới 60 giây kể từ mã trước cùng loại) thì từ chối. */
async function sentTooRecently(db: Db, type: "email-verification" | "forget-password", email: string) {
  const [row] = await db
    .select()
    .from(schema.verification)
    .where(eq(schema.verification.identifier, `${type}-otp-${email}`));
  return !!row && Date.now() - row.createdAt.getTime() < RESEND_GAP_MS;
}

/** "thanh@gmail.com" → "th***@gmail.com". */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

/** Email che giả nhưng cố định cho SĐT không có tài khoản — để phản hồi trông như khi có (không lộ tài khoản). */
function fakeMaskedEmail(phone: string, secret: string): string {
  const h = createHmac("sha256", secret).update(phone).digest();
  const letters = "abcdefghiklmnopqrstuvxy";
  return `${letters[h[0] % letters.length]}${letters[h[1] % letters.length]}***@gmail.com`;
}

/** Chưa đăng ký nhưng chưa từng xác nhận email → coi như bỏ dở, cho người khác (hoặc chính họ) đăng ký lại. */
async function removeUnverified(db: Db, user: typeof schema.user.$inferSelect | undefined) {
  if (user && !user.emailVerified) await db.delete(schema.user).where(eq(schema.user.id, user.id));
}

export function accountRoutes() {
  const r = new Hono<AppEnv>();

  r.post("/register", async (c) => {
    const { db } = c.get("deps");
    const b = await body<{ phone: string; email: string; password: string; confirmPassword: string }>(c);
    const phone = normalizePhone(b.phone ?? "");
    const email = (b.email ?? "").trim().toLowerCase();
    const password = b.password ?? "";
    if (!phone) return fail(c, "invalid_phone");
    if (!EMAIL_RE.test(email)) return fail(c, "invalid_email");
    if (password.length < MIN_PASSWORD) return fail(c, "password_too_short");
    if (password !== b.confirmPassword) return fail(c, "password_mismatch");

    const byPhone = await userByPhone(db, phone);
    if (byPhone?.emailVerified) return fail(c, "phone_taken", 409);
    const byEmail = await userByEmail(db, email);
    if (byEmail?.emailVerified) return fail(c, "email_taken", 409);
    await removeUnverified(db, byPhone);
    if (byEmail?.id !== byPhone?.id) await removeUnverified(db, byEmail);

    // Better Auth tạo tài khoản (chưa kích hoạt) và gửi OTP kích hoạt qua email.
    await c.get("auth").api.signUpEmail({ body: { email, password, name: phone, phoneNumber: phone } as never });
    return c.json({ ok: true, email });
  });

  r.post("/verify", async (c) => {
    const { db } = c.get("deps");
    const b = await body<{ email: string; otp: string }>(c);
    const email = (b.email ?? "").trim().toLowerCase();
    let res;
    try {
      res = await c.get("auth").api.verifyEmailOTP({ body: { email, otp: String(b.otp ?? "") }, returnHeaders: true });
    } catch (err) {
      return otpError(c, err);
    }
    forwardCookies(c, res.headers);
    const user = await userByEmail(db, email);
    const bookId = await ensureBook(db, user.id);
    return c.json({ userId: user.id, phone: user.phoneNumber, bookId });
  });

  r.post("/resend", async (c) => {
    const { db } = c.get("deps");
    const b = await body<{ email: string }>(c);
    const email = (b.email ?? "").trim().toLowerCase();
    const user = await userByEmail(db, email);
    // Không lộ email có tài khoản hay không: luôn trả ok, chỉ gửi khi có tài khoản chưa kích hoạt.
    if (user && !user.emailVerified) {
      if (await sentTooRecently(db, "email-verification", email)) return fail(c, "resend_too_soon", 429);
      await c.get("auth").api.sendVerificationOTP({ body: { email, type: "email-verification" } });
    }
    return c.json({ ok: true });
  });

  r.post("/login", async (c) => {
    const { db } = c.get("deps");
    const b = await body<{ phone: string; password: string }>(c);
    const phone = normalizePhone(b.phone ?? "");
    if (!phone) return fail(c, "invalid_credentials", 401);

    const now = Date.now();
    const [throttle] = await db.select().from(schema.loginThrottle).where(eq(schema.loginThrottle.phone, phone));
    if (throttle?.lockedUntil && throttle.lockedUntil > now) {
      return fail(c, "locked", 423, { retryAfter: Math.ceil((throttle.lockedUntil - now) / 1000) });
    }

    let res;
    try {
      res = await c.get("auth").api.signInPhoneNumber({
        body: { phoneNumber: phone, password: b.password ?? "" },
        returnHeaders: true,
      });
    } catch {
      // Đếm cả SĐT chưa có tài khoản để phản hồi giống hệt nhau.
      const failures = (throttle?.failures ?? 0) + 1;
      const locked = failures >= LOCK_AFTER_FAILURES;
      await db
        .insert(schema.loginThrottle)
        .values({ phone, failures: locked ? 0 : failures, lockedUntil: locked ? now + LOCK_MS : null })
        .onConflictDoUpdate({
          target: schema.loginThrottle.phone,
          set: { failures: locked ? 0 : failures, lockedUntil: locked ? now + LOCK_MS : null },
        });
      return locked
        ? fail(c, "locked", 423, { retryAfter: LOCK_MS / 1000 })
        : fail(c, "invalid_credentials", 401);
    }

    await db.delete(schema.loginThrottle).where(eq(schema.loginThrottle.phone, phone));
    const user = (await userByPhone(db, phone))!;
    if (!user.emailVerified) {
      // Mật khẩu đúng nhưng chưa kích hoạt: huỷ phiên vừa tạo, gửi lại mã (design D3, spike 2.3).
      await db.delete(schema.session).where(eq(schema.session.userId, user.id));
      if (!(await sentTooRecently(db, "email-verification", user.email))) {
        await c.get("auth").api.sendVerificationOTP({ body: { email: user.email, type: "email-verification" } });
      }
      return fail(c, "email_not_verified", 403, { email: user.email });
    }
    forwardCookies(c, res.headers);
    const bookId = await ensureBook(db, user.id);
    return c.json({ userId: user.id, phone, bookId });
  });

  r.post("/forgot", async (c) => {
    const { db, secret } = c.get("deps");
    const b = await body<{ phone: string }>(c);
    const phone = normalizePhone(b.phone ?? "");
    if (!phone) return fail(c, "invalid_phone");
    const user = await userByPhone(db, phone);
    if (!user?.emailVerified) return c.json({ ok: true, maskedEmail: fakeMaskedEmail(phone, secret) });
    if (await sentTooRecently(db, "forget-password", user.email)) return fail(c, "resend_too_soon", 429);
    await c.get("auth").api.requestPasswordResetEmailOTP({ body: { email: user.email } });
    return c.json({ ok: true, maskedEmail: maskEmail(user.email) });
  });

  r.post("/reset", async (c) => {
    const { db } = c.get("deps");
    const b = await body<{ phone: string; otp: string; password: string; confirmPassword: string }>(c);
    const phone = normalizePhone(b.phone ?? "");
    const password = b.password ?? "";
    if (!phone) return fail(c, "invalid_phone");
    if (password.length < MIN_PASSWORD) return fail(c, "password_too_short");
    if (password !== b.confirmPassword) return fail(c, "password_mismatch");
    const user = await userByPhone(db, phone);
    if (!user?.emailVerified) return fail(c, "invalid_otp");
    try {
      await c.get("auth").api.resetPasswordEmailOTP({ body: { email: user.email, otp: String(b.otp ?? ""), password } });
    } catch (err) {
      return otpError(c, err);
    }
    // Mọi phiên cũ đã bị thu hồi (revokeSessionsOnPasswordReset); gỡ luôn khoá đăng nhập.
    await db.delete(schema.loginThrottle).where(eq(schema.loginThrottle.phone, phone));
    return c.json({ ok: true });
  });

  r.post("/logout", async (c) => {
    try {
      const res = await c.get("auth").api.signOut({ headers: c.req.raw.headers, returnHeaders: true });
      forwardCookies(c, res.headers);
    } catch {
      // Không có phiên thì coi như đã đăng xuất.
    }
    return c.json({ ok: true });
  });

  r.get("/me", async (c) => {
    const me = await currentUser(c);
    if (!me) return fail(c, "unauthorized", 401);
    return c.json(me);
  });

  return r;
}

/** Người đang đăng nhập (theo cookie phiên) cùng sổ của họ; `null` nếu chưa đăng nhập. */
export async function currentUser(c: Ctx): Promise<{ userId: string; phone: string; bookId: string } | null> {
  const session = await c.get("auth").api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;
  const { db } = c.get("deps");
  const [user] = await db
    .select()
    .from(schema.user)
    .where(and(eq(schema.user.id, session.user.id), eq(schema.user.emailVerified, true)));
  if (!user?.phoneNumber) return null;
  return { userId: user.id, phone: user.phoneNumber, bookId: await ensureBook(db, user.id) };
}
