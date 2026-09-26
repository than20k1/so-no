"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n";
import { isIos, useInstallPrompt } from "@/lib/install";
import { useHasTransactions } from "@/lib/ledger/hooks";
import { CloseIcon } from "./icons";

const DISMISS_KEY = "so-no.installHintDismissed";

// Trạng thái "đã đóng gợi ý" dùng chung cho chấm báo trên nút menu và thẻ gợi ý trong menu.
const dismissListeners = new Set<() => void>();

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeDismissed(cb: () => void) {
  dismissListeners.add(cb);
  return () => dismissListeners.delete(cb);
}

function dismissInstallHint() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {}
  dismissListeners.forEach((l) => l());
}

/** Có nên gợi ý cài app không: chưa cài, sổ đã có giao dịch, và người dùng chưa đóng gợi ý. */
export function useInstallHint() {
  const { standalone } = useInstallPrompt();
  const hasTx = useHasTransactions();
  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => true);
  return { visible: !standalone && hasTx && !dismissed, dismiss: dismissInstallHint };
}

const noopSubscribe = () => () => {};

/** Nội dung hướng dẫn cài — dùng trong thẻ gợi ý và mục "Cài ra màn hình chính" của menu. */
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

/** Thẻ gợi ý cài app — hiện trong menu (không đặt ở màn chính để đỡ rối mắt). */
export function InstallHint() {
  const { t } = useI18n();
  const { visible, dismiss } = useInstallHint();
  if (!visible) return null;

  return (
    <section
      aria-label={t("installTitle")}
      className="relative mx-3 mb-2 rounded-2xl border border-line bg-surface p-4 pr-12"
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
