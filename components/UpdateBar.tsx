"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { applyUpdate, useUpdateState } from "@/lib/update";
import { CloseIcon } from "./icons";

/**
 * Thanh "Có bản mới — Cập nhật" trên cùng màn hình (spec offline-app-shell).
 * Nằm trong luồng trang (không đè lên gì), nên không che nút Lưu của form. Ẩn tạm được trong phiên.
 */
export function UpdateBar() {
  const { t } = useI18n();
  const { waiting, stale } = useUpdateState();
  const [hidden, setHidden] = useState(false);
  if (!(waiting || stale) || hidden) return null;

  return (
    <div
      role="region"
      aria-label={t("updateAvailable")}
      aria-live="polite"
      data-testid="update-bar"
      className="mx-auto flex w-full max-w-[480px] items-center gap-2 bg-foreground px-3 pt-[max(6px,env(safe-area-inset-top))] pb-1.5 text-background"
    >
      <span className="flex-1 text-sm font-medium">{t("updateAvailable")}</span>
      <button
        type="button"
        onClick={applyUpdate}
        className="min-h-9 rounded-full bg-background px-4 text-sm font-bold text-foreground active:opacity-80"
      >
        {t("updateNow")}
      </button>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label={t("close")}
        className="grid size-9 place-items-center rounded-full active:bg-white/20"
      >
        <CloseIcon width={18} height={18} />
      </button>
    </div>
  );
}
