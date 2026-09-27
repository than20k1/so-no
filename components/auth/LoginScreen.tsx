"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccountT } from "@/lib/i18n/account";
import { useQueryParam, withNext } from "@/lib/nav";
import { accountApi } from "@/lib/sync/api";
import { PageHeader } from "../PageHeader";
import { Field, FormError, NeedNetwork, PasswordInput, SubmitButton, TextInput, useErrorText } from "./common";
import { OtpStep } from "./OtpStep";
import { useFinishLogin } from "./useFinishLogin";

export function LoginScreen() {
  const t = useAccountT();
  const next = useQueryParam("next");
  const errorText = useErrorText();
  const { finish, dialog } = useFinishLogin();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await accountApi.login({ phone, password });
    setBusy(false);
    if (res.ok) return finish(res);
    // Mật khẩu đúng nhưng chưa kích hoạt: chuyển sang nhập mã (server đã gửi lại mã).
    if (res.error === "email_not_verified" && res.email) return setOtpEmail(res.email);
    setError(errorText(res.error, res.retryAfter));
  }

  return (
    <>
      <PageHeader title={t("login")} />
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
            <p className="text-sm text-muted">{t("loginIntro")}</p>
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
            <Field label={t("password")}>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                name="password"
              />
            </Field>
            <FormError message={error} />
            <SubmitButton busy={busy} disabled={!phone || !password}>
              {t("login")}
            </SubmitButton>
            <Link href="/quen-mat-khau/" className="text-center text-[15px] font-semibold underline">
              {t("forgotPassword")}
            </Link>
            <p className="text-center text-sm">
              {t("noAccount")}{" "}
              <Link href={withNext("/dang-ky/", next)} replace className="font-semibold underline">
                {t("register")}
              </Link>
            </p>
          </form>
        )}
      </main>
      {dialog}
    </>
  );
}
