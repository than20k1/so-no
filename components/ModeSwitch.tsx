"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { saveMode, type AppMode } from "@/lib/mode";

const TABS: { mode: AppMode; href: string; key: "modeDebt" | "modeSplit" }[] = [
  { mode: "ghi-no", href: "/", key: "modeDebt" },
  { mode: "chia-tien", href: "/chia-tien/", key: "modeSplit" },
];

/** Công tắc `Ghi nợ | Chia tiền` trên header. Dùng tab (không phải link) để không lẫn với nút lớn "Ghi nợ". */
export function ModeSwitch({ current }: { current: AppMode }) {
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    saveMode(current);
    for (const tab of TABS) if (tab.mode !== current) router.prefetch(tab.href);
  }, [current, router]);

  return (
    <div role="tablist" aria-label={t("modeSwitch")} className="flex shrink-0 rounded-full bg-line p-1" data-testid="mode-switch">
      {TABS.map((tab) => {
        const active = tab.mode === current;
        return (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (active) return;
              saveMode(tab.mode);
              router.push(tab.href);
            }}
            className={`min-h-11 rounded-full px-3 text-[15px] font-semibold whitespace-nowrap transition-colors ${
              active ? "bg-surface text-foreground shadow-sm" : "text-muted"
            }`}
          >
            {t(tab.key)}
          </button>
        );
      })}
    </div>
  );
}
