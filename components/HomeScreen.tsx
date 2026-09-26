"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBackupReminder, useDebtors } from "@/lib/ledger/hooks";
import { formatMoney } from "@/lib/money";
import { filterByName } from "@/lib/resolve";
import { MenuIcon, MinusIcon, PlusIcon, SearchIcon } from "./icons";
import { InstallHint } from "./InstallHint";
import { useMenuState } from "./useMenuState";
import { useBackupActions } from "./useBackupActions";

// Menu ít dùng → tải lười cho màn chính nhẹ; service worker vẫn precache nên mở được khi offline.
const Menu = dynamic(() => import("./Menu"), { ssr: false });

export function HomeScreen() {
  const { t } = useI18n();
  const menu = useMenuState();
  const debtors = useDebtors();
  const [query, setQuery] = useState("");

  const total = useMemo(() => (debtors ?? []).reduce((sum, d) => sum + Math.max(d.balance, 0), 0), [debtors]);

  const rows = useMemo(() => {
    if (!debtors) return [];
    // Đang tìm → hiện cả người đã trả hết; không tìm → chỉ người đang nợ.
    const list = query.trim() ? filterByName(query, debtors) : debtors.filter((d) => d.balance > 0);
    return [...list].sort((a, b) => b.lastTxAt - a.lastTxAt);
  }, [debtors, query]);

  return (
    <>
      <header className="flex items-center gap-2 px-2 pt-[max(8px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={menu.show}
          aria-label={t("menu")}
          aria-expanded={menu.open}
          className="grid size-12 place-items-center rounded-full active:bg-line"
        >
          <MenuIcon />
        </button>
        <div className="ml-auto pr-3 text-right">
          <div className="text-xs text-muted">{t("totalOwed")}</div>
          <div className="tabular text-xl font-bold" data-testid="total">
            {debtors ? formatMoney(total) : "—"}
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 pt-3 pb-24">
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/ghi/"
            className="flex h-28 flex-col items-center justify-center gap-1 rounded-3xl bg-add text-white shadow-sm active:bg-add-press"
          >
            <PlusIcon width={32} height={32} strokeWidth={2.5} />
            <span className="text-xl font-bold">{t("addDebt")}</span>
          </Link>
          <Link
            href="/tru/"
            className="flex h-28 flex-col items-center justify-center gap-1 rounded-3xl bg-pay text-white shadow-sm active:bg-pay-press"
          >
            <MinusIcon width={32} height={32} strokeWidth={2.5} />
            <span className="text-xl font-bold">{t("payDebt")}</span>
          </Link>
        </div>

        <BackupReminderBanner />
        <InstallHint />

        {debtors && debtors.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{t("emptyBook")}</p>
        ) : (
          <section className="flex flex-col gap-2">
            <label className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-3 focus-within:border-foreground">
              <SearchIcon className="shrink-0 text-muted" width={20} height={20} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="min-h-12 w-full bg-transparent text-[16px] outline-none"
              />
            </label>

            {!debtors ? (
              <p className="p-4 text-center text-muted">{t("loading")}</p>
            ) : rows.length === 0 ? (
              <p className="p-4 text-center text-muted">{query.trim() ? t("noResults") : t("nobodyOwes")}</p>
            ) : (
              <ul className="overflow-hidden rounded-2xl border border-line bg-surface" data-testid="debtor-list">
                {rows.map((d) => (
                  <li key={d.id} className="border-b border-line last:border-b-0">
                    <Link
                      href={`/nguoi/?id=${d.id}`}
                      className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-line"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-medium">{d.name}</span>
                        {d.note && <span className="block truncate text-sm text-muted">{d.note}</span>}
                      </span>
                      <span className="tabular shrink-0 text-[16px] font-semibold">{formatMoney(d.balance)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      {menu.open && <Menu open onClose={menu.close} />}
    </>
  );
}

function BackupReminderBanner() {
  const { t } = useI18n();
  const show = useBackupReminder();
  const { exportNow } = useBackupActions();
  if (!show) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-amber-100 p-3 text-amber-900" data-testid="backup-reminder">
      <p className="flex-1 text-sm">{t("backupReminder")}</p>
      <button type="button" onClick={exportNow} className="min-h-11 shrink-0 rounded-xl bg-amber-900 px-3 text-sm font-semibold text-amber-50">
        {t("backupNow")}
      </button>
    </div>
  );
}
