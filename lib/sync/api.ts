// Gọi API tài khoản (/api/account/*) từ trình duyệt.
import type { Me } from "./account";

export type AccountErrorCode =
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
  | "unauthorized"
  | "offline"
  | "server";

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: AccountErrorCode; email?: string; retryAfter?: number };

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<ApiResult<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, error: "offline" };
  let res: Response;
  try {
    res = await fetch(`/api/account/${path}/`, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, error: "offline" };
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, ...(data as T) };
  return { ok: false, error: (data.error as AccountErrorCode) ?? "server", email: data.email, retryAfter: data.retryAfter };
}

export const accountApi = {
  register: (b: { phone: string; email: string; password: string; confirmPassword: string }) =>
    call<{ email: string }>("POST", "register", b),
  verify: (b: { email: string; otp: string }) => call<Me>("POST", "verify", b),
  resend: (email: string) => call<object>("POST", "resend", { email }),
  login: (b: { phone: string; password: string }) => call<Me>("POST", "login", b),
  forgot: (phone: string) => call<{ maskedEmail: string }>("POST", "forgot", { phone }),
  reset: (b: { phone: string; otp: string; password: string; confirmPassword: string }) =>
    call<object>("POST", "reset", b),
  logout: () => call<object>("POST", "logout", {}),
  me: () => call<Me>("GET", "me"),
};
