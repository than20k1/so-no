"use client";

import { useState, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n";
import { isIos, useInstallPrompt } from "@/lib/install";
import { useHasTransactions } from "@/lib/ledger/hooks";
import { CloseIcon } from "./icons";

const DISMISS_KEY = "so-no.installHintDismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

const noopSubscribe = () => () => {};

/** Nội dung hướng dẫn cài — dùng trong gợi ý ở màn chính và trong menu. */
export function InstallInstructions() {
  const { t } = useI18n();
  const { canPrompt, standalone, prompt } = useInstallPrompt();
  const ios = useSyncExternalStore(noopSubscribe, isIos, () => false);

  if (standalone) return <p className="text-sm text-muted">{t("installed")}</p>;
  if (ios) return <p className="text-sm">{t("installIos")}</p>;
  if (canPrompt) {
    return (
      <button
        type="button"
        onClick={prompt}
        className="min-h-11 rounded-xl bg-foreground px-4 text-[15px] font-semibold text-background active:opacity-80"
      >
        {t("installAction")}
      </button>
    );
  }
  return <p className="text-sm">{t("installAndroidManual")}</p>;
}

/** Gợi ý cài ra màn hình chính: chỉ khi chưa cài, đã có giao dịch, và chưa bị đóng. */
export function InstallHint() {
  const { t } = useI18n();
  const { standalone } = useInstallPrompt();
  const hasTx = useHasTransactions();
  const storedDismissed = useSyncExternalStore(noopSubscribe, readDismissed, () => true);
  const [dismissed, setDismissed] = useState(false);

  if (standalone || !hasTx || storedDismissed || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  return (
    <section
      aria-label={t("installTitle")}
      className="relative rounded-2xl border border-line bg-surface p-4 pr-12"
      data-testid="install-hint"
    >
      <h2 className="text-[15px] font-semibold">{t("installTitle")}</h2>
      <p className="mb-2 text-sm text-muted">{t("installBody")}</p>
      <InstallInstructions />
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("close")}
        className="absolute top-2 right-2 grid size-11 place-items-center rounded-full text-muted active:bg-line"
      >
        <CloseIcon width={20} height={20} />
      </button>
    </section>
  );
}
