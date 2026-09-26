"use client";

import Link from "next/link";
import { formatDate, formatDateTime, isSameDay } from "@/lib/date";
import { useI18n, type TKey } from "@/lib/i18n";
import type { Transaction, TxSource } from "@/lib/ledger";
import { useDebtor, useHistory } from "@/lib/ledger/hooks";
import { formatMoney, formatNumber } from "@/lib/money";
import { useQueryParam } from "@/lib/nav";
import { MinusIcon, PlusIcon } from "./icons";
import { PageHeader } from "./PageHeader";

const SOURCE_KEY: Record<TxSource, TKey> = {
  manual: "sourceManual",
  backup: "sourceBackup",
  scan: "sourceScan",
};

export function DebtorDetail() {
  const { t } = useI18n();
  const id = useQueryParam("id");
  const debtor = useDebtor(id);
  const history = useHistory(id);

  if (debtor === null && id !== null) {
    return (
      <>
        <PageHeader title="" />
        <p className="p-6 text-center text-muted">{t("personNotFound")}</p>
      </>
    );
  }

  return (
    <>
      <PageHeader title={debtor?.name ?? ""} />
      <main className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-10">
        <section className="rounded-3xl border border-line bg-surface p-4">
          {debtor?.note && <p className="mb-1 text-sm text-muted">{debtor.note}</p>}
          <p className="text-sm text-muted">{t("owing")}</p>
          <p className="tabular text-4xl font-bold" data-testid="balance">
            {debtor ? formatMoney(debtor.balance) : "—"}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link
              href={`/ghi/?id=${id ?? ""}`}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-add text-lg font-bold text-white active:bg-add-press"
            >
              <PlusIcon width={22} height={22} />
              {t("addMore")}
            </Link>
            <Link
              href={`/tru/?id=${id ?? ""}`}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-pay text-lg font-bold text-white active:bg-pay-press"
            >
              <MinusIcon width={22} height={22} />
              {t("payDebt")}
            </Link>
          </div>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-sm font-medium text-muted">{t("history")}</h2>
          {!history ? (
            <p className="p-4 text-center text-muted">{t("loading")}</p>
          ) : history.length === 0 ? (
            <p className="p-4 text-center text-muted">{t("noHistory")}</p>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface" data-testid="history">
              {history.map((tx) => (
                <HistoryRow key={tx.id} tx={tx} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

export function HistoryRow({ tx }: { tx: Transaction }) {
  const { t } = useI18n();
  const voided = tx.voidedAt !== null;
  const main = tx.occurredAt ?? tx.createdAt;
  // Ngày xảy ra khác ngày ghi (hoặc không rõ) → ghi rõ nguồn và ngày nhập vào app.
  const showSource = tx.occurredAt === null || !isSameDay(tx.occurredAt, tx.createdAt);
  const mainLabel =
    tx.occurredAt === null
      ? formatDate(tx.createdAt)
      : showSource
        ? formatDate(main)
        : formatDateTime(main);

  return (
    <li className="border-b border-line px-4 py-3 last:border-b-0" data-testid="history-row" data-voided={voided || undefined}>
      <div className="flex items-baseline gap-3">
        <span className="tabular text-sm text-muted">{mainLabel}</span>
        <span
          className={`tabular ml-auto text-lg font-semibold ${voided ? "text-muted line-through" : tx.kind === "add" ? "text-add" : "text-pay"}`}
        >
          {tx.kind === "add" ? "+" : "−"} {formatNumber(tx.amount)}
        </span>
      </div>
      {tx.note && <p className={`text-sm ${voided ? "text-muted line-through" : ""}`}>{tx.note}</p>}
      {showSource && (
        <p className="text-xs text-muted">
          {tx.occurredAt === null && `${t("noDate")} · `}
          {t("importedOn", { source: t(SOURCE_KEY[tx.source]), date: formatDate(tx.createdAt) })}
        </p>
      )}
      {voided && <p className="text-xs text-muted">{t("voidedAt", { time: formatDateTime(tx.voidedAt!) })}</p>}
    </li>
  );
}
