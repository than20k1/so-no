"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccountT } from "@/lib/i18n/account";
import { useQueryParam, withNext } from "@/lib/nav";
import { normalizePhone } from "@/lib/phone";
import { accountApi } from "@/lib/sync/api";
import { PageHeader } from "../PageHeader";
import { Field, FormError, NeedNetwork, PasswordInput, SubmitButton, TextInput, useErrorText } from "./common";
import { OtpStep } from "./OtpStep";
import { useFinishLogin } from "./useFinishLogin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function RegisterScreen() {
  const t = useAccountT();
  const next = useQueryParam("next");
  const errorText = useErrorText();
  const { finish, dialog } = useFinishLogin();
  const [form, setForm] = useState({ phone: "", email: "", password: "", confirmPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError(null);
  };

  async function submit() {
    // Kiểm tra tại chỗ trước, server kiểm tra lại.
    if (!normalizePhone(form.phone)) return setError(t("errInvalidPhone"));
    if (!EMAIL_RE.test(form.email.trim())) return setError(t("errInvalidEmail"));
    if (form.password.length < 6) return setError(t("errPasswordShort"));
    if (form.password !== form.confirmPassword) return setError(t("errPasswordMismatch"));
    setBusy(true);
    const res = await accountApi.register(form);
    setBusy(false);
    if (res.ok) setOtpEmail(res.email);
    else setError(errorText(res.error));
  }

  return (
    <>
      <PageHeader title={t("register")} />
      <main className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-10">
        <NeedNetwork />
        {otpEmail ? (
          <OtpStep email={otpEmail} onVerified={(me) => void finish(me)} />
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <p className="text-sm text-muted">{t("registerIntro")}</p>
            <Field label={t("phone")}>
              <TextInput
                value={form.phone}
                onChange={set("phone")}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={t("phonePlaceholder")}
                name="phone"
                autoFocus
              />
            </Field>
            <Field label={t("email")} hint={t("emailHint")}>
              <TextInput
                value={form.email}
                onChange={set("email")}
                type="email"
                inputMode="email"
                autoComplete="email"
                name="email"
              />
            </Field>
            <Field label={t("password")} hint={t("passwordHint")}>
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
            <SubmitButton busy={busy}>{t("createAccount")}</SubmitButton>
            <p className="text-center text-sm">
              {t("haveAccount")}{" "}
              <Link href={withNext("/dang-nhap/", next)} replace className="font-semibold underline">
                {t("login")}
              </Link>
            </p>
          </form>
        )}
      </main>
      {dialog}
    </>
  );
}
