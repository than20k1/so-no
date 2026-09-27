"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { formatDateTime } from "@/lib/date";
import { groupApi } from "@/lib/groups/api";
import { createGroup, GroupError, SELF_NAME_META } from "@/lib/groups/groups";
import { useGroupList } from "@/lib/groups/hooks";
import type { GroupView } from "@/lib/groups/view";
import { groupErrorKey, useGroupsT } from "@/lib/i18n/groups";
import { getMeta } from "@/lib/ledger/db";
import { formatMoney } from "@/lib/money";
import { readAccountMarker } from "@/lib/sync/marker";
import { MainHeader } from "../MainHeader";
import { useToast } from "../Toast";
import { card, ErrorText, input, primaryBtn, secondaryBtn } from "./ui";

const noopSubscribe = () => () => {};
/** Đang đăng nhập trên máy này không (dấu hiệu nhẹ trong localStorage, không cần tải lib/sync). */
export function useLoggedIn(): boolean {
  return useSyncExternalStore(noopSubscribe, () => readAccountMarker() !== null, () => false);
}

/** Kéo nhóm từ server ngay khi mở màn Chia tiền (kể cả tài khoản chưa có nhóm nào). */
export function useGroupSyncOnOpen(enabled: boolean) {
  useEffect(() => {
    if (enabled) void import("@/lib/sync").then((m) => m.syncNow({ groups: true }));
  }, [enabled]);
}

export function GroupsScreen() {
  const t = useGroupsT();
  const loggedIn = useLoggedIn();
  const groups = useGroupList();
  const [creating, setCreating] = useState(false);
  useGroupSyncOnOpen(loggedIn);

  const live = loggedIn ? groups?.filter((g) => !g.group.deletedAt) : [];
  const trash = loggedIn ? (groups ?? []).filter((g) => g.group.deletedAt && g.isCreator) : [];
  const net = (live ?? []).reduce((sum, g) => sum + g.myBalance, 0);

  return (
    <>
      <MainHeader mode="chia-tien">
        {loggedIn && live && live.length > 0 && (
          <>
            <div className="truncate text-xs text-muted">{net > 0 ? t("youGetShort") : net < 0 ? t("youOweShort") : t("allEven")}</div>
            <div className="tabular truncate text-lg font-bold" data-testid="split-total">
              {formatMoney(Math.abs(net))}
            </div>
          </>
        )}
      </MainHeader>

      <main className="flex flex-1 flex-col gap-4 px-4 pt-3 pb-24">
        {!loggedIn ? (
          <section className={`${card} flex flex-col gap-3 p-5 text-center`} data-testid="split-login">
            <h1 className="text-xl font-bold">{t("loginToSplit")}</h1>
            <p className="text-muted">{t("loginToSplitBody")}</p>
            <Link href={`/dang-nhap/?next=${encodeURIComponent("/chia-tien/")}`} className={`${primaryBtn} grid place-items-center`}>
              {t("splitLogin")}
            </Link>
          </section>
        ) : (
          <>
            {creating ? (
              <CreateGroupForm onCancel={() => setCreating(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="min-h-16 rounded-3xl bg-add text-xl font-bold text-white shadow-sm active:bg-add-press"
              >
                + {t("newGroup")}
              </button>
            )}

            {live === undefined ? (
              <p className="p-4 text-center text-muted">{t("loading")}</p>
            ) : live.length === 0 ? (
              !creating && <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{t("noGroups")}</p>
            ) : (
              <ul className={`${card} overflow-hidden`} data-testid="group-list">
                {live.map((g) => (
                  <GroupRow key={g.group.id} g={g} />
                ))}
              </ul>
            )}

            {trash.length > 0 && <DeletedGroups groups={trash} />}
          </>
        )}
      </main>
    </>
  );
}

function GroupRow({ g }: { g: GroupView }) {
  const t = useGroupsT();
  const status = g.settled
    ? t("settledUp")
    : g.myBalance > 0
      ? t("youGet", { amount: formatMoney(g.myBalance) })
      : g.myBalance < 0
        ? t("youOwe", { amount: formatMoney(-g.myBalance) })
        : null;
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={`/chia-tien/nhom/?id=${g.group.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 active:bg-line">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold">{g.group.name}</span>
          <span className="block truncate text-sm text-muted">
            {t("members", { n: g.active.length })} · {t("totalSpent", { amount: formatMoney(g.total) })}
          </span>
        </span>
        {status && (
          <span
            className={`shrink-0 text-right text-sm font-semibold ${g.myBalance < 0 && !g.settled ? "text-add" : g.myBalance > 0 ? "text-pay" : "text-muted"}`}
          >
            {status}
          </span>
        )}
      </Link>
    </li>
  );
}

function CreateGroupForm({ onCancel }: { onCancel: () => void }) {
  const t = useGroupsT();
  const router = useRouter();
  const lastSelf = useLiveQuery(async () => (await getMeta<string>(SELF_NAME_META)) ?? "", []);
  const [name, setName] = useState("");
  const [self, setSelf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selfName = self ?? lastSelf ?? "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const id = await createGroup({ name, selfName });
      router.push(`/chia-tien/nhom/?id=${id}`);
    } catch (err) {
      setError(t(groupErrorKey(err instanceof GroupError ? err.code : "")));
    }
  }

  return (
    <form onSubmit={submit} className={`${card} flex flex-col gap-3 p-4`} data-testid="create-group">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-muted">{t("groupName")}</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("groupNamePlaceholder")} maxLength={200} className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-muted">{t("yourName")}</span>
        <input value={selfName} onChange={(e) => setSelf(e.target.value)} placeholder={t("yourNamePlaceholder")} maxLength={200} className={input} />
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className={`${secondaryBtn} flex-1`}>
          {t("cancel")}
        </button>
        <button type="submit" className={`${primaryBtn} flex-1`}>
          {t("create")}
        </button>
      </div>
    </form>
  );
}

function DeletedGroups({ groups }: { groups: GroupView[] }) {
  const t = useGroupsT();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function restore(id: string) {
    setBusy(id);
    const res = await groupApi().restore(id);
    if (res.ok) {
      const { syncNow } = await import("@/lib/sync");
      await syncNow({ groups: true });
      toast({ message: t("groupRestored"), showOn: "/chia-tien/" });
    } else toast({ message: t(groupErrorKey(res.error)), showOn: "/chia-tien/" });
    setBusy(null);
  }

  return (
    <section className="flex flex-col gap-2" data-testid="deleted-groups">
      <h2 className="px-1 text-sm font-semibold text-muted">{t("deletedGroups")}</h2>
      <p className="px-1 text-xs text-muted">{t("deletedGroupsHint")}</p>
      <ul className={`${card} overflow-hidden`}>
        {groups.map((g) => (
          <li key={g.group.id} className="flex min-h-14 items-center gap-3 border-b border-line px-4 py-2 last:border-b-0">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{g.group.name}</span>
              <span className="block text-xs text-muted">{t("groupDeletedOn", { time: formatDateTime(g.group.deletedAt!) })}</span>
            </span>
            <button type="button" disabled={busy === g.group.id} onClick={() => restore(g.group.id)} className={secondaryBtn}>
              {t("restore")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
