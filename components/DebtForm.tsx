"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { addDebt, payDebt, voidTransaction, type Debtor, type DebtorTarget } from "@/lib/ledger";
import { useDebtors } from "@/lib/ledger/hooks";
import { formatMoney, parseAmount, toThousandsInput } from "@/lib/money";
import { useQueryParam } from "@/lib/nav";
import { filterByName, resolveDebtor } from "@/lib/resolve";
import { cleanDisplayName, normalizeName } from "@/lib/text";
import { CloseIcon, PlusIcon } from "./icons";
import { PageHeader } from "./PageHeader";
import { useToast } from "./Toast";

export type DebtFormMode = "add" | "pay";

const QUICK_AMOUNTS = [10_000, 20_000, 50_000, 100_000, 200_000, 500_000];
const MAX_SUGGESTIONS = 6;

type Selection = { type: "existing"; debtor: Debtor } | { type: "new"; name: string } | null;

export function DebtForm({ mode }: { mode: DebtFormMode }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const debtors = useDebtors();
  const presetId = useQueryParam("id");

  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [debtorNote, setDebtorNote] = useState("");
  const [amountText, setAmountText] = useState("");
  // Số tiền chính xác (đồng); thường = parseAmount(amountText), riêng "Trả hết" có thể lẻ.
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overpayConfirmed, setOverpayConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  // Tải trước màn chính để sau khi lưu quay về được ngay, kể cả khi vừa mất mạng
  // mà service worker chưa kịp cài (lần mở app đầu tiên).
  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  // Chọn sẵn người khi mở từ màn chi tiết (?id=...).
  const presetDone = useRef(false);
  useEffect(() => {
    if (presetDone.current || !presetId || !debtors) return;
    presetDone.current = true;
    const found = debtors.find((d) => d.id === presetId);
    if (found) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- danh sách người nợ chỉ có sau khi đọc IndexedDB
      setSelection({ type: "existing", debtor: found });
      amountRef.current?.focus();
    }
  }, [presetId, debtors]);

  // Giữ số dư của người đã chọn luôn mới (dữ liệu có thể đổi ở tab khác).
  const selected =
    selection?.type === "existing" ? (debtors?.find((d) => d.id === selection.debtor.id) ?? selection.debtor) : null;

  const suggestions = useMemo(() => {
    if (!debtors || selection) return [];
    if (!query.trim()) {
      // Trừ nợ: khi chưa gõ gì, gợi ý luôn những người đang nợ gần đây.
      return mode === "pay"
        ? debtors.filter((d) => d.balance > 0).sort((a, b) => b.lastTxAt - a.lastTxAt).slice(0, MAX_SUGGESTIONS)
        : [];
    }
    const key = normalizeName(query);
    return filterByName(query, debtors)
      .sort(
        (a, b) =>
          Number(b.searchKey === key) - Number(a.searchKey === key) ||
          Number(b.balance > 0) - Number(a.balance > 0) ||
          b.lastTxAt - a.lastTxAt,
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [debtors, query, selection, mode]);

  const showCreateRow = mode === "add" && !selection && cleanDisplayName(query) !== "";
  const owing = selected?.balance ?? 0;
  const overpay = mode === "pay" && selected !== null && amount > owing;

  function setAmountFromText(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 7);
    setAmountText(digits);
    setAmount(parseAmount(digits));
    setOverpayConfirmed(false);
    setError(null);
  }

  function setAmountExact(value: number) {
    setAmount(value);
    setAmountText(toThousandsInput(value));
    setOverpayConfirmed(false);
    setError(null);
  }

  function pick(debtor: Debtor) {
    setSelection({ type: "existing", debtor });
    setError(null);
    amountRef.current?.focus();
  }

  function pickCreate() {
    setSelection({ type: "new", name: cleanDisplayName(query) });
    setError(null);
  }

  function clearSelection() {
    setSelection(null);
    setDebtorNote("");
    setOverpayConfirmed(false);
    setError(null);
    requestAnimationFrame(() => nameRef.current?.focus());
  }

  /** Xác định người nhận giao dịch; trả về lỗi để hiện nếu chưa xác định được. */
  function resolveTarget(): DebtorTarget | { error: string } {
    if (selection?.type === "existing") return { debtorId: selection.debtor.id };
    if (selection?.type === "new") return { newDebtor: { name: selection.name, note: debtorNote } };
    const resolved = resolveDebtor(query, debtors ?? []);
    if (resolved.type === "existing") return { debtorId: resolved.debtor.id };
    if (resolved.type === "ambiguous") return { error: t("ambiguous") };
    if (mode === "pay") return { error: t("noSuchPerson") };
    return { newDebtor: { name: cleanDisplayName(query), note: debtorNote } };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving || amount <= 0) return;

    const target = resolveTarget();
    if ("error" in target) {
      setError(target.error);
      return;
    }

    if (mode === "pay" && "debtorId" in target && !overpayConfirmed) {
      const current = debtors?.find((d) => d.id === target.debtorId)?.balance ?? 0;
      if (amount > current) {
        setOverpayConfirmed(true);
        setError(t("overpayWarning", { owing: formatMoney(current) }));
        return;
      }
    }

    setSaving(true);
    try {
      const result = mode === "add" ? await addDebt({ target, amount, note }) : await payDebt({ target, amount, note });
      router.replace("/");
      toast({
        message: t(mode === "add" ? "toastAdded" : "toastPaid", {
          amount: formatMoney(result.transaction.amount),
          name: result.debtor.name,
        }),
        actionLabel: t("undo"),
        onAction: () => {
          voidTransaction(result.transaction.id)
            .then(() => toast({ message: t("undone") }))
            .catch(() => toast({ message: t("saveFailed") }));
        },
      });
    } catch {
      setSaving(false);
      setError(t("saveFailed"));
    }
  }

  const accent = mode === "add" ? "bg-add active:bg-add-press" : "bg-pay active:bg-pay-press";
  const hasName = selection !== null || cleanDisplayName(query) !== "";
  const canSave = amount > 0 && hasName && !saving;

  return (
    <>
      <PageHeader title={mode === "add" ? t("addDebt") : t("payDebt")} />
      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-8" noValidate>
        {/* Tên người nợ */}
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="text-sm font-medium text-muted">
            {t("name")}
          </label>
          {selection ? (
            <div className="flex items-center gap-3 rounded-2xl border-2 border-foreground bg-surface px-4 py-2" data-testid="selected-person">
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-semibold">
                  {selection.type === "existing" ? selected?.name : selection.name}
                  {selection.type === "new" && (
                    <span className="ml-2 rounded-full bg-line px-2 py-0.5 align-middle text-xs font-medium text-muted">
                      {t("createNew")}
                    </span>
                  )}
                </div>
                {selected && (
                  <div className="text-sm text-muted">
                    {selected.note && `${selected.note} · `}
                    {t("owing")}: <span className="tabular font-semibold text-foreground">{formatMoney(selected.balance)}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={clearSelection}
                aria-label={t("close")}
                className="grid size-11 shrink-0 place-items-center rounded-full active:bg-line"
              >
                <CloseIcon width={20} height={20} />
              </button>
            </div>
          ) : (
            <input
              ref={nameRef}
              id="name"
              autoFocus={!presetId}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  amountRef.current?.focus();
                }
              }}
              placeholder={mode === "add" ? t("namePlaceholder") : t("pickPersonPlaceholder")}
              className="min-h-14 rounded-2xl border-2 border-line bg-surface px-4 text-lg outline-none focus:border-foreground"
            />
          )}

          {(suggestions.length > 0 || showCreateRow) && (
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface" role="listbox" aria-label={t("name")}>
              {suggestions.map((d) => (
                <li key={d.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => pick(d)}
                    className="flex min-h-13 w-full items-center gap-3 px-4 py-2 text-left active:bg-line"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-medium">{d.name}</span>
                      {d.note && <span className="block truncate text-sm text-muted">{d.note}</span>}
                    </span>
                    <span className="tabular shrink-0 text-sm text-muted">{formatMoney(d.balance)}</span>
                  </button>
                </li>
              ))}
              {showCreateRow && (
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={pickCreate}
                    className="flex min-h-13 w-full items-center gap-2 px-4 py-2 text-left font-medium text-add active:bg-line"
                  >
                    <PlusIcon width={20} height={20} />
                    <span className="truncate">
                      {t("createNew")}: “{cleanDisplayName(query)}”
                    </span>
                  </button>
                </li>
              )}
            </ul>
          )}

          {selection?.type === "new" && (
            <input
              value={debtorNote}
              onChange={(e) => setDebtorNote(e.target.value)}
              placeholder={t("distinguishNote")}
              aria-label={t("distinguishNote")}
              className="min-h-12 rounded-2xl border border-line bg-surface px-4 text-[16px] outline-none focus:border-foreground"
            />
          )}
        </div>

        {/* Số tiền */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="amount" className="text-sm font-medium text-muted">
              {t("amount")}
            </label>
            <span className="text-xs text-muted">{t("amountHint")}</span>
          </div>
          <div className="flex items-center rounded-2xl border-2 border-line bg-surface px-4 focus-within:border-foreground">
            <input
              ref={amountRef}
              id="amount"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              enterKeyHint="done"
              value={amountText}
              onChange={(e) => setAmountFromText(e.target.value)}
              placeholder="0"
              className="tabular min-h-16 w-full min-w-0 bg-transparent text-3xl font-bold outline-none"
            />
            <span className="tabular shrink-0 text-2xl font-bold text-muted">.000</span>
          </div>
          <div className="tabular text-right text-lg font-semibold" data-testid="amount-preview" aria-live="polite">
            {formatMoney(amount)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {QUICK_AMOUNTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmountExact(amount + v)}
                className="min-h-12 rounded-xl border border-line bg-surface text-[16px] font-semibold active:bg-line"
              >
                +{v / 1000}k
              </button>
            ))}
          </div>
          {mode === "pay" && selected && selected.balance > 0 && (
            <button
              type="button"
              onClick={() => setAmountExact(selected.balance)}
              className="min-h-12 rounded-xl border-2 border-pay text-[16px] font-semibold text-pay active:bg-line"
            >
              {t("payAll")} ({formatMoney(selected.balance)})
            </button>
          )}
        </div>

        {/* Ghi chú (tùy chọn, ẩn mặc định để không làm chậm) */}
        {showNote ? (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("notePlaceholder")}
            aria-label={t("note")}
            maxLength={200}
            className="min-h-12 rounded-2xl border border-line bg-surface px-4 text-[16px] outline-none focus:border-foreground"
          />
        ) : (
          <button type="button" onClick={() => setShowNote(true)} className="self-start text-[15px] font-medium text-muted underline">
            + {t("note")}
          </button>
        )}

        {error && (
          <p role="alert" data-testid="form-error" className={`rounded-xl p-3 text-sm ${overpay && overpayConfirmed ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-900"}`}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSave}
          className={`min-h-16 rounded-2xl text-xl font-bold text-white shadow-sm disabled:opacity-40 ${accent}`}
        >
          {t("save")}
        </button>
      </form>
    </>
  );
}
