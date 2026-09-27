"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { formatDate, formatDateTime, isSameDay } from "@/lib/date";
import { useI18n, type TKey } from "@/lib/i18n";
import { restoreDebtor, type DebtorEvent, type Transaction, type TxSource } from "@/lib/ledger";
import { useDebtor, useDebtorEvents, useHistory } from "@/lib/ledger/hooks";
import { formatMoney, formatNumber } from "@/lib/money";
import { useQueryParam } from "@/lib/nav";
import { MinusIcon, PlusIcon } from "./icons";
import { PageHeader } from "./PageHeader";
import { useToast } from "./Toast";

// Bảng sửa/xoá ít dùng → tải lười, không làm nặng màn chi tiết.
const DebtorEditSheet = dynamic(() => import("./DebtorEditSheet"), {
  ssr: false,
});

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
  const events = useDebtorEvents(id);
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const deleted = !!debtor?.deletedAt;

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
      <PageHeader
        title={debtor?.name ?? ""}
        action={
          debtor &&
          !deleted && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-11 shrink-0 rounded-full px-4 text-[16px] font-semibold active:bg-line"
            >
              {t("edit")}
            </button>
          )
        }
      />
      <main className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-10">
        <section className="rounded-3xl border border-line bg-surface p-4">
          {debtor?.note && <p className="mb-1 text-sm text-muted">{debtor.note}</p>}
          <p className="text-sm text-muted">{t("owing")}</p>
          <p className="tabular text-4xl font-bold" data-testid="balance">
            {debtor ? formatMoney(debtor.balance) : "—"}
          </p>
          {deleted ? (
            // Người trong thùng rác: chỉ xem và khôi phục (spec debtor-history).
            <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-line/60 p-3" data-testid="deleted-banner">
              <p className="text-sm">{t("deletedBanner", { date: formatDate(debtor.deletedAt!) })}</p>
              <button
                type="button"
                onClick={() =>
                  restoreDebtor(debtor.id)
                    .then(() =>
                      toast({
                        message: t("toastRestored", { name: debtor.name }),
                      }),
                    )
                    .catch(() => toast({ message: t("actionFailed") }))
                }
                className="min-h-12 rounded-2xl bg-foreground text-[16px] font-bold text-background active:opacity-80"
              >
                {t("restore")}
              </button>
            </div>
          ) : (
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
          )}
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

        {debtor && events && <EditHistory events={events} createdAt={debtor.createdAt} />}
      </main>

      {editing && debtor && !deleted && <DebtorEditSheet debtor={debtor} onClose={() => setEditing(false)} />}
    </>
  );
}

/** Lịch sử sửa (mới nhất ở trên), dòng cuối là lúc tạo người nợ. */
export function EditHistory({ events, createdAt }: { events: DebtorEvent[]; createdAt: number }) {
  const { t } = useI18n();
  const value = (v: string | undefined) => v || t("emptyValue");

  const lines = (e: DebtorEvent): string[] => {
    switch (e.kind) {
      case "edit": {
        const out: string[] = [];
        if (e.before?.name !== e.after?.name)
          out.push(
            t("evRename", {
              from: value(e.before?.name),
              to: value(e.after?.name),
            }),
          );
        if (e.before?.note !== e.after?.note)
          out.push(
            t("evNote", {
              from: value(e.before?.note),
              to: value(e.after?.note),
            }),
          );
        return out;
      }
      case "delete":
        return [t("evDelete")];
      case "restore":
        return [t("evRestore")];
      case "purge":
        return [t("evPurge")];
    }
  };

  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-medium text-muted">{t("editHistory")}</h2>
      <ul className="overflow-hidden rounded-2xl border border-line bg-surface" data-testid="edit-history">
        {events.map((e) => (
          <li key={e.id} className="flex gap-3 border-b border-line px-4 py-3 text-sm" data-testid="edit-row">
            <span className="tabular shrink-0 text-muted">{formatDateTime(e.at)}</span>
            <span className="min-w-0 flex-1 break-words">
              {lines(e).map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </span>
          </li>
        ))}
        <li className="flex gap-3 px-4 py-3 text-sm" data-testid="edit-row">
          <span className="tabular shrink-0 text-muted">{formatDateTime(createdAt)}</span>
          <span className="flex-1">{t("evCreated")}</span>
        </li>
      </ul>
    </section>
  );
}

export function HistoryRow({ tx }: { tx: Transaction }) {
  const { t } = useI18n();
  const voided = tx.voidedAt !== null;
  const main = tx.occurredAt ?? tx.createdAt;
  // Ngày xảy ra khác ngày ghi (hoặc không rõ) → ghi rõ nguồn và ngày nhập vào app.
  const showSource = tx.occurredAt === null || !isSameDay(tx.occurredAt, tx.createdAt);
  const mainLabel =
    tx.occurredAt === null ? formatDate(tx.createdAt) : showSource ? formatDate(main) : formatDateTime(main);

  return (
    <li
      className="border-b border-line px-4 py-3 last:border-b-0"
      data-testid="history-row"
      data-voided={voided || undefined}
    >
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
          {t("importedOn", {
            source: t(SOURCE_KEY[tx.source]),
            date: formatDate(tx.createdAt),
          })}
        </p>
      )}
      {voided && <p className="text-xs text-muted">{t("voidedAt", { time: formatDateTime(tx.voidedAt!) })}</p>}
    </li>
  );
}
