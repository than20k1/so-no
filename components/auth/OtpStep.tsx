"use client";

import { useState } from "react";
import { useAccountT } from "@/lib/i18n/account";
import type { Me } from "@/lib/sync/account";
import { accountApi } from "@/lib/sync/api";
import { useToast } from "../Toast";
import { Field, FormError, SubmitButton, TextInput, useCountdown, useErrorText } from "./common";

/** Bước nhập mã kích hoạt 6 số gửi qua email. Đủ 6 số thì tự gửi. */
export function OtpStep({ email, onVerified }: { email: string; onVerified: (me: Me) => void }) {
  const t = useAccountT();
  const toast = useToast();
  const errorText = useErrorText();
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useCountdown(60);

  async function verify(code: string) {
    setBusy(true);
    setError(null);
    const res = await accountApi.verify({ email, otp: code });
    setBusy(false);
    if (res.ok) return onVerified(res);
    setError(errorText(res.error));
    setOtp("");
  }

  async function resend() {
    const res = await accountApi.resend(email);
    if (res.ok) {
      toast({ message: t("codeResent") });
      setLeft(60);
    } else setError(errorText(res.error));
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void verify(otp);
      }}
      data-testid="otp-step"
    >
      <h2 className="text-lg font-bold">{t("otpTitle")}</h2>
      <p className="text-sm text-muted">{t("otpSent", { email })}</p>
      <Field label={t("otpCode")}>
        <TextInput
          value={otp}
          onChange={(e) => {
            const code = e.target.value.replace(/\D/g, "").slice(0, 6);
            setOtp(code);
            if (code.length === 6 && !busy) void verify(code);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          data-testid="otp-input"
          style={{ letterSpacing: "0.4em", fontSize: 24, textAlign: "center" }}
        />
      </Field>
      <FormError message={error} />
      <SubmitButton busy={busy} disabled={otp.length !== 6}>
        {t("confirm")}
      </SubmitButton>
      <button
        type="button"
        onClick={resend}
        disabled={left > 0}
        className="min-h-11 text-[15px] font-semibold underline disabled:text-muted disabled:no-underline"
      >
        {left > 0 ? t("resendIn", { s: left }) : t("resendCode")}
      </button>
    </form>
  );
}
