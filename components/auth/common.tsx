"use client";

import { useEffect, useState, useSyncExternalStore, type InputHTMLAttributes, type ReactNode } from "react";
import { useAccountT, type AccountKey } from "@/lib/i18n/account";
import type { AccountErrorCode } from "@/lib/sync/api";

const ERROR_KEY: Record<AccountErrorCode, AccountKey> = {
  invalid_phone: "errInvalidPhone",
  invalid_email: "errInvalidEmail",
  password_too_short: "errPasswordShort",
  password_mismatch: "errPasswordMismatch",
  phone_taken: "errPhoneTaken",
  email_taken: "errEmailTaken",
  invalid_otp: "errInvalidOtp",
  otp_expired: "errOtpExpired",
  too_many_attempts: "errTooManyAttempts",
  resend_too_soon: "errResendTooSoon",
  invalid_credentials: "errInvalidCredentials",
  locked: "errLocked",
  email_not_verified: "errServer",
  unauthorized: "errInvalidCredentials",
  offline: "errOffline",
  server: "errServer",
};

/** Thông báo lỗi dễ hiểu cho mã lỗi API. */
export function useErrorText() {
  const t = useAccountT();
  return (error: AccountErrorCode, retryAfter?: number) =>
    t(ERROR_KEY[error] ?? "errServer", { m: Math.max(1, Math.ceil((retryAfter ?? 900) / 60)) });
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** Có mạng không (theo trình duyệt). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function NeedNetwork() {
  const t = useAccountT();
  const online = useOnline();
  if (online) return null;
  return (
    <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900" data-testid="need-network">
      {t("needNetwork")}
    </p>
  );
}

const inputClass =
  "min-h-13 w-full rounded-xl border border-line bg-surface px-3 text-[17px] outline-none focus:border-foreground";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClass} />;
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const t = useAccountT();
  const [show, setShow] = useState(false);
  return (
    <span className="relative flex">
      <input {...props} type={show ? "text" : "password"} className={`${inputClass} pr-16`} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-1 my-1 rounded-lg px-3 text-sm text-muted active:bg-line"
      >
        {show ? t("hidePassword") : t("showPassword")}
      </button>
    </span>
  );
}

export function SubmitButton({ busy, children, disabled }: { busy: boolean; children: ReactNode; disabled?: boolean }) {
  const t = useAccountT();
  const online = useOnline();
  return (
    <button
      type="submit"
      disabled={busy || disabled || !online}
      className="min-h-13 rounded-2xl bg-foreground text-lg font-bold text-background active:opacity-80 disabled:opacity-50"
    >
      {busy ? t("working") : children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="text-sm text-add" role="alert" data-testid="auth-error">
      {message}
    </p>
  );
}

/** Đếm ngược (giây) cho nút "Gửi lại mã". */
export function useCountdown(initial: number) {
  const [left, setLeft] = useState(initial);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return [left, setLeft] as const;
}
