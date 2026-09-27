"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n, type Lang } from "@/lib/i18n";
import { useBackupReminder, useTrashCount } from "@/lib/ledger/hooks";
import { CloseIcon } from "./icons";
import { InstallHint, InstallInstructions } from "./InstallHint";
import { useToast } from "./Toast";
import { useBackupActions } from "./useBackupActions";

const LANGS: { value: Lang; label: string }[] = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
];

export default function Menu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang, setLang } = useI18n();
  const toast = useToast();
  const reminder = useBackupReminder();
  const trashCount = useTrashCount();
  const { exportNow, pickFile, pending, confirmImport, cancelImport } = useBackupActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showInstall, setShowInstall] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const item = "flex min-h-13 w-full items-center gap-3 rounded-xl px-3 text-left text-[16px] active:bg-line";

  return (
    // Luôn giữ trong DOM sau lần mở đầu để có hiệu ứng cả lúc mở lẫn lúc đóng.
    // Khi đóng: `inert` chặn focus/đọc màn hình, `invisible` áp dụng sau khi trượt xong (delay bằng thời gian trượt).
    <div
      className={`fixed inset-0 z-40 transition-[visibility] duration-0 motion-reduce:delay-0 ${
        open ? "visible delay-0" : "pointer-events-none invisible delay-300"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={t("menu")}
      inert={!open}
    >
      <button
        type="button"
        aria-label={t("close")}
        tabIndex={-1}
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out motion-reduce:transition-none starting:opacity-0 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        data-testid="menu-backdrop"
      />
      <nav
        className={`absolute inset-y-0 left-0 flex w-[85%] max-w-[360px] flex-col gap-1 overflow-y-auto bg-background p-3 pt-[max(12px,env(safe-area-inset-top))] shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none starting:-translate-x-full ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="px-3 text-lg font-bold">{t("appName")}</span>
          <button
            ref={closeRef}
            type="button"
            data-testid="menu-close"
            onClick={onClose}
            aria-label={t("close")}
            className="grid size-12 place-items-center rounded-full active:bg-line"
          >
            <CloseIcon />
          </button>
        </div>

        <InstallHint />

        <div className="px-3 pt-2 pb-1 text-sm font-medium text-muted">{t("language")}</div>
        <div className="grid grid-cols-2 gap-2 px-3 pb-3" role="radiogroup" aria-label={t("language")}>
          {LANGS.map((l) => (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={lang === l.value}
              onClick={() => setLang(l.value)}
              className={`min-h-12 rounded-xl border text-[15px] font-medium ${
                lang === l.value ? "border-foreground bg-foreground text-background" : "border-line bg-surface"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="border-t border-line" />

        {reminder && <p className="mx-3 mt-2 rounded-xl bg-amber-100 p-3 text-sm text-amber-900">{t("backupReminder")}</p>}
        <button type="button" className={item} onClick={exportNow}>
          {t("exportBackup")}
        </button>
        <button type="button" className={item} onClick={() => fileRef.current?.click()}>
          {t("importBackup")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="import-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) pickFile(file);
          }}
        />
        {pending && (
          <div className="mx-3 my-1 rounded-xl border border-line bg-surface p-3" data-testid="import-confirm">
            <p className="mb-3 text-sm">
              {t("importSummary", {
                debtors: pending.preview.debtors,
                transactions: pending.preview.transactions,
                newDebtors: pending.preview.newDebtors,
                newTransactions: pending.preview.newTransactions,
                skipped: pending.preview.skipped,
              })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmImport}
                className="min-h-11 flex-1 rounded-xl bg-foreground font-semibold text-background"
              >
                {t("importConfirm")}
              </button>
              <button type="button" onClick={cancelImport} className="min-h-11 flex-1 rounded-xl border border-line">
                {t("cancel")}
              </button>
            </div>
          </div>
        )}

        <div className="border-t border-line" />

        <Link
          href="/thung-rac/"
          className={item}
          data-testid="menu-trash"
          // Bỏ `#menu` khỏi mục lịch sử hiện tại, để quay lại từ thùng rác về màn chính với menu đã đóng.
          onClick={() => window.history.replaceState(window.history.state, "", window.location.pathname)}
        >
          <span className="flex-1">{t("trash")}</span>
          {trashCount > 0 && <span className="tabular rounded-full bg-line px-2 py-0.5 text-sm">{trashCount}</span>}
        </Link>

        <button type="button" className={item} onClick={() => setShowInstall((v) => !v)} aria-expanded={showInstall}>
          {t("installGuide")}
        </button>
        {showInstall && (
          <div className="px-3 pb-2">
            <InstallInstructions />
          </div>
        )}
        <button type="button" className={item} onClick={() => toast({ message: t("comingSoonMessage") })}>
          <span className="flex-1">{t("loginSync")}</span>
          <span className="rounded-full bg-line px-2 py-0.5 text-xs text-muted">{t("comingSoon")}</span>
        </button>
      </nav>
    </div>
  );
}
