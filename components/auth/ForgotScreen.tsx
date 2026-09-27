"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccountT } from "@/lib/i18n/account";
import { normalizePhone } from "@/lib/phone";
import { accountApi } from "@/lib/sync/api";
import { PageHeader } from "../PageHeader";
import { useToast } from "../Toast";
import {
  Field,
  FormError,
  NeedNetwork,
  PasswordInput,
  SubmitButton,
  TextInput,
  useCountdown,
  useErrorText,
} from "./common";

export function ForgotScreen() {
  const t = useAccountT();
  const router = useRouter();
  const toast = useToast();
  const errorText = useErrorText();
  const [phone, setPhone] = useState("");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [form, setForm] = useState({ otp: "", password: "", confirmPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useCountdown(0);

  async function sendCode() {
    if (!normalizePhone(phone)) return setError(t("errInvalidPhone"));
    setBusy(true);
    setError(null);
    const res = await accountApi.forgot(phone);
    setBusy(false);
    if (!res.ok) return setError(errorText(res.error));
    setMaskedEmail(res.maskedEmail);
    setLeft(60);
  }

  async function reset() {
    if (form.password.length < 6) return setError(t("errPasswordShort"));
    if (form.password !== form.confirmPassword) return setError(t("errPasswordMismatch"));
    setBusy(true);
    setError(null);
    const res = await accountApi.reset({ phone, ...form });
    setBusy(false);
    if (!res.ok) return setError(errorText(res.error));
    router.replace("/dang-nhap/");
    toast({ message: t("resetDone") });
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: k === "otp" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value }));
    setError(null);
  };

  return (
    <>
      <PageHeader title={t("forgotTitle")} />
      <main className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-10">
        <NeedNetwork />
        {!maskedEmail ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void sendCode();
            }}
          >
            <p className="text-sm text-muted">{t("forgotIntro")}</p>
            <Field label={t("phone")}>
              <TextInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t("phonePlaceholder")}
                name="phone"
                autoFocus
              />
            </Field>
            <FormError message={error} />
            <SubmitButton busy={busy}>{t("sendCode")}</SubmitButton>
          </form>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void reset();
            }}
            data-testid="reset-step"
          >
            <p className="text-sm text-muted">{t("forgotSent", { email: maskedEmail })}</p>
            <Field label={t("otpCode")}>
              <TextInput
                value={form.otp}
                onChange={set("otp")}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                name="otp"
                autoFocus
              />
            </Field>
            <Field label={t("newPassword")} hint={t("passwordHint")}>
              <PasswordInput
                value={form.password}
                onChange={set("password")}
                autoComplete="new-password"
                name="password"
              />
            </Field>
            <Field label={t("confirmPassword")}>
              <PasswordInput
                value={form.confirmPassword}
                onChange={set("confirmPassword")}
                autoComplete="new-password"
                name="confirmPassword"
              />
            </Field>
            <FormError message={error} />
            <SubmitButton busy={busy} disabled={form.otp.length !== 6}>
              {t("confirm")}
            </SubmitButton>
            <button
              type="button"
              onClick={sendCode}
              disabled={left > 0}
              className="min-h-11 text-[15px] font-semibold underline disabled:text-muted disabled:no-underline"
            >
              {left > 0 ? t("resendIn", { s: left }) : t("resendCode")}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
