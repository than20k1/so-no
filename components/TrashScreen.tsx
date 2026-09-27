"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/date";
import { useI18n } from "@/lib/i18n";
import { purgeDebtor, purgeExpired, restoreDebtor, trashState, trustedNow, type Debtor } from "@/lib/ledger";
import { useTrash } from "@/lib/ledger/hooks";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "./PageHeader";
import { useToast } from "./Toast";

export function TrashScreen() {
  const { t } = useI18n();
  const trash = useTrash();
  // Chụp thời điểm mở trang để tính mốc 15/30 ngày (không gọi Date.now() lúc render);
  // khi đã đăng nhập thì chỉnh theo giờ server.
  const [now, setNow] = useState(() => Date.now());

  // Mở thùng rác cũng dọn luôn người đã đủ 30 ngày (ngoài lần dọn lúc mở app).
  useEffect(() => {
    trustedNow()
      .then((t) => {
        setNow(t);
        return purgeExpired(t);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <PageHeader title={t("trash")} />
      <main className="flex flex-1 flex-col gap-3 px-4 pt-2 pb-10">
        <p className="px-1 text-sm text-muted">{t("trashHint")}</p>
        {!trash ? (
          <p className="p-4 text-center text-muted">{t("loading")}</p>
        ) : trash.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{t("trashEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="trash-list">
            {trash.map((d) => (
              <TrashRow key={d.id} debtor={d} now={now} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function TrashRow({ debtor, now }: { debtor: Debtor; now: number }) {
  const { t } = useI18n();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const state = trashState(debtor.deletedAt!, now);

  const run = (action: Promise<unknown>, message: string) =>
    action.then(() => toast({ message })).catch(() => toast({ message: t("actionFailed") }));

  return (
    <li className="rounded-2xl border border-line bg-surface p-4" data-testid="trash-row">
      <Link href={`/nguoi/?id=${debtor.id}`} className="flex items-baseline gap-3 active:opacity-70">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-medium">{debtor.name}</span>
          {debtor.note && <span className="block truncate text-sm text-muted">{debtor.note}</span>}
        </span>
        <span className="tabular shrink-0 font-semibold">{formatMoney(debtor.balance)}</span>
      </Link>
      <p className="mt-1 text-sm text-muted">
        {t("deletedOn", { date: formatDate(debtor.deletedAt!) })} · {t("autoPurgeIn", { days: state.daysLeft })}
      </p>

      {confirming ? (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-add/40 p-3" data-testid="purge-confirm">
          <p className="text-sm">{t("purgeConfirmBody", { name: debtor.name })}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => run(purgeDebtor(debtor.id), t("toastPurged", { name: debtor.name }))}
              className="min-h-11 flex-1 rounded-xl bg-add font-semibold text-white active:bg-add-press"
            >
              {t("purge")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-11 flex-1 rounded-xl border border-line"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => run(restoreDebtor(debtor.id), t("toastRestored", { name: debtor.name }))}
            className="min-h-11 flex-1 rounded-xl bg-foreground font-semibold text-background active:opacity-80"
          >
            {t("restore")}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!state.canPurge}
            className="min-h-11 flex-1 rounded-xl border border-line font-semibold text-add active:bg-line disabled:text-muted disabled:opacity-60"
          >
            {t("purge")}
          </button>
        </div>
      )}
      {!state.canPurge && (
        <p className="mt-2 text-xs text-muted" data-testid="purge-allowed-from">
          {t("purgeAllowedFrom", { date: formatDate(state.purgeAllowedAt) })}
        </p>
      )}
    </li>
  );
}
