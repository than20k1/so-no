"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { deleteDebtor, editDebtor, LedgerError, restoreDebtor, type Debtor } from "@/lib/ledger";
import { useDebtors } from "@/lib/ledger/hooks";
import { formatMoney } from "@/lib/money";
import { normalizeName } from "@/lib/text";
import { CloseIcon } from "./icons";
import { useToast } from "./Toast";

/** Bảng sửa tên/ghi chú và xoá người nợ — tải lười từ màn chi tiết. */
export default function DebtorEditSheet({ debtor, onClose }: { debtor: Debtor; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const debtors = useDebtors();
  const [name, setName] = useState(debtor.name);
  const [note, setNote] = useState(debtor.note);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Trùng tên người khác chỉ cảnh báo, không chặn lưu (spec debtor-management).
  const key = normalizeName(name);
  const duplicate = !!key && (debtors ?? []).some((d) => d.id !== debtor.id && d.searchKey === key);

  async function save() {
    if (!name.trim()) return setError(t("nameRequired"));
    setBusy(true);
    try {
      await editDebtor(debtor.id, { name, note });
      onClose();
    } catch (err) {
      setError(err instanceof LedgerError && err.code === "invalid_name" ? t("nameRequired") : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteDebtor(debtor.id);
      router.replace("/");
      toast({
        message: t("toastDeleted", { name: debtor.name }),
        actionLabel: t("undo"),
        onAction: () => {
          restoreDebtor(debtor.id)
            .then(() => toast({ message: t("toastRestored", { name: debtor.name }) }))
            .catch(() => toast({ message: t("actionFailed") }));
        },
      });
    } catch {
      setBusy(false);
      setError(t("actionFailed"));
    }
  }

  const input =
    "min-h-12 w-full rounded-xl border border-line bg-background px-3 text-[16px] outline-none focus:border-foreground";

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={t("editPerson")}>
      <button
        type="button"
        aria-label={t("close")}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 transition-opacity duration-300 motion-reduce:transition-none starting:opacity-0"
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-w-[480px] flex-col gap-3 rounded-t-3xl bg-surface px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none starting:translate-y-full"
        data-testid="edit-sheet"
      >
        <div className="flex items-center">
          <h2 className="flex-1 text-lg font-bold">{t("editPerson")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="grid size-11 place-items-center rounded-full active:bg-line"
          >
            <CloseIcon />
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted">{t("name")}</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            className={input}
            data-testid="edit-name"
            autoComplete="off"
          />
        </label>
        {duplicate && (
          <p className="rounded-xl bg-amber-100 p-2 text-sm text-amber-900" data-testid="duplicate-warning">
            {t("duplicateName")}
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm text-muted">{t("distinguishNote")}</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={input}
            data-testid="edit-note"
            autoComplete="off"
          />
        </label>
        {error && (
          <p className="text-sm text-add" role="alert" data-testid="edit-error">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="min-h-13 rounded-2xl bg-foreground text-lg font-bold text-background active:opacity-80 disabled:opacity-50"
        >
          {t("save")}
        </button>

        <div className="border-t border-line pt-2">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-12 w-full rounded-xl text-[16px] font-semibold text-add active:bg-line"
            >
              {t("deletePerson")}
            </button>
          ) : (
            <div className="flex flex-col gap-2 rounded-2xl border border-add/40 p-3" data-testid="delete-confirm">
              <p className="text-sm">
                {t("deleteConfirmBody", { name: debtor.name, amount: formatMoney(debtor.balance) })}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="min-h-11 flex-1 rounded-xl bg-add font-semibold text-white active:bg-add-press disabled:opacity-50"
                >
                  {t("deleteAction")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-11 flex-1 rounded-xl border border-line"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
