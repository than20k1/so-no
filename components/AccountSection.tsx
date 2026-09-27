"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { formatDateTime } from "@/lib/date";
import { useAccountT } from "@/lib/i18n/account";
import { formatPhone } from "@/lib/phone";
import { logout, pendingGroupCount, refreshPending, syncNow, syncStore, type SyncState } from "@/lib/sync";
import { useToast } from "./Toast";

/** Bỏ `#menu` khỏi mục lịch sử hiện tại trước khi rời màn chính, để quay lại thì menu đã đóng. */
const dropMenuHash = () => window.history.replaceState(window.history.state, "", window.location.pathname);

export function AccountSection({ itemClass }: { itemClass: string }) {
  const t = useAccountT();
  const toast = useToast();
  const s = useSyncExternalStore(syncStore.subscribe, syncStore.getState, syncStore.getState);
  // "keep"/"wipe": đã đếm lại và còn thay đổi chưa gửi sẽ mất → hỏi thêm lần nữa.
  const [confirm, setConfirm] = useState<null | "choose" | "keep" | "wipe">(null);
  const [groupPending, setGroupPending] = useState(0);

  // Mở menu thì cập nhật ngay số thay đổi chờ gửi (không chờ lượt đồng bộ kế tiếp).
  useEffect(() => {
    if (s.phone) void refreshPending();
  }, [s.phone]);

  if (!s.phone) {
    return (
      <Link href="/dang-nhap/" className={itemClass} onClick={dropMenuHash} data-testid="menu-login">
        {t("loginSync")}
      </Link>
    );
  }

  async function doLogout(wipe: boolean) {
    await logout({ wipe });
    setConfirm(null);
    toast({ message: t("loggedOut") });
  }

  return (
    <section className="mx-3 my-2 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3" data-testid="account">
      <div className="flex items-baseline gap-2">
        <span className="text-sm text-muted">{t("account")}</span>
        <span className="tabular ml-auto font-semibold">{formatPhone(s.phone)}</span>
      </div>
      <p className="text-sm" data-testid="sync-status">
        {statusText(s, t)}
      </p>
      <p className="text-xs text-muted">
        {s.lastSyncAt ? t("lastSync", { time: formatDateTime(s.lastSyncAt) }) : t("neverSynced")}
      </p>

      {s.phase === "needs_login" ? (
        <Link href="/dang-nhap/" onClick={dropMenuHash} className="flex min-h-11 items-center justify-center rounded-xl bg-foreground font-semibold text-background">
          {t("login")}
        </Link>
      ) : confirm === null ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={s.phase === "syncing"}
            className="min-h-11 flex-1 rounded-xl bg-foreground font-semibold text-background active:opacity-80 disabled:opacity-50"
          >
            {t("syncNow")}
          </button>
          <button type="button" onClick={() => setConfirm("choose")} className="min-h-11 flex-1 rounded-xl border border-line">
            {t("logout")}
          </button>
        </div>
      ) : null}

      {confirm && (
        <div className="flex flex-col gap-2 rounded-xl border border-line p-3" data-testid="logout-confirm">
          <p className="text-sm font-semibold">{t("logoutTitle")}</p>
          <p className="text-sm text-muted">{t("logoutGroupsNote")}</p>
          {confirm === "wipe" && (
            <p className="rounded-lg bg-amber-100 p-2 text-sm text-amber-900" data-testid="logout-unsynced">
              {t("logoutUnsynced", { n: s.pending })}
            </p>
          )}
          {confirm === "keep" && (
            <p className="rounded-lg bg-amber-100 p-2 text-sm text-amber-900" data-testid="logout-groups-unsynced">
              {t("logoutGroupsUnsynced", { n: groupPending })}
            </p>
          )}
          {confirm !== "wipe" && (
            <button
              type="button"
              onClick={async () => {
                // Giữ sổ nhưng nhóm luôn bị xoá khỏi máy → còn thay đổi nhóm chưa gửi thì hỏi thêm lần nữa.
                const n = confirm === "choose" ? await pendingGroupCount() : 0;
                if (n > 0) {
                  setGroupPending(n);
                  setConfirm("keep");
                } else await doLogout(false);
              }}
              className="min-h-11 rounded-xl bg-foreground font-semibold text-background"
            >
              {confirm === "keep" ? t("logoutKeepConfirm") : t("logoutKeep")}
            </button>
          )}
          {confirm !== "keep" && <button
            type="button"
            onClick={async () => {
              // Đếm lại ngay lúc bấm: vừa ghi xong thì trạng thái có thể chưa kịp cập nhật — không được xoá mất dữ liệu.
              if (confirm === "choose" && (await refreshPending()) > 0) setConfirm("wipe");
              else await doLogout(true);
            }}
            className="min-h-11 rounded-xl border border-add/50 font-semibold text-add"
          >
            {confirm === "wipe" ? t("logoutWipeConfirm") : t("logoutWipe")}
          </button>}
          <button type="button" onClick={() => setConfirm(null)} className="min-h-11 rounded-xl text-sm text-muted">
            {t("cancel")}
          </button>
        </div>
      )}
    </section>
  );
}

function statusText(s: SyncState, t: ReturnType<typeof useAccountT>): string {
  switch (s.phase) {
    case "syncing":
      return t("syncing");
    case "offline":
      return t("syncOffline");
    case "error":
      return t("syncError");
    case "needs_login":
      return t("syncNeedsLogin");
    default:
      return s.pending > 0 ? t("syncPending", { n: s.pending }) : t("syncIdle");
  }
}
