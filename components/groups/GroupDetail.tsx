"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { formatDateTime } from "@/lib/date";
import { groupApi } from "@/lib/groups/api";
import {
  addGuest,
  dropGroupLocal,
  editMember,
  GroupError,
  isMemberInUse,
  removeMember,
  renameGroup,
  restoreExpense,
  saveSettlement,
} from "@/lib/groups/groups";
import { useGroup } from "@/lib/groups/hooks";
import type { GroupView } from "@/lib/groups/view";
import { groupErrorKey, useGroupsT } from "@/lib/i18n/groups";
import type { Expense, GroupMember } from "@/lib/ledger/types";
import { formatMoney } from "@/lib/money";
import { useQueryParam } from "@/lib/nav";
import { PageHeader } from "../PageHeader";
import { useToast } from "../Toast";
import { useGroupSyncOnOpen, useLoggedIn } from "./GroupsScreen";
import { describeEvent, itemLabel } from "./history";
import { AmountField, Badge, card, dangerBtn, ErrorText, GROUP_PATH, input, primaryBtn, secondaryBtn, WeightStepper } from "./ui";

// Bảng mời bạn (link, QR) ít dùng → tải lười.
const InviteSheet = dynamic(() => import("./InviteSheet"), { ssr: false });

type Tab = "expenses" | "result" | "members" | "history";
const TABS: { id: Tab; key: "tabExpenses" | "tabResult" | "tabMembers" | "tabHistory" }[] = [
  { id: "expenses", key: "tabExpenses" },
  { id: "result", key: "tabResult" },
  { id: "members", key: "tabMembers" },
  { id: "history", key: "tabHistory" },
];
const TAB_KEY = "so-no.groupTab";

function readTab(): Tab {
  try {
    const v = sessionStorage.getItem(TAB_KEY);
    return TABS.some((x) => x.id === v) ? (v as Tab) : "expenses";
  } catch {
    return "expenses";
  }
}


export function GroupDetail() {
  const t = useGroupsT();
  const id = useQueryParam("id");
  const g = useGroup(id);
  const loggedIn = useLoggedIn();
  const [tab, setTabState] = useState<Tab>("expenses");
  const [inviting, setInviting] = useState(false);
  useGroupSyncOnOpen(loggedIn);

  // Nhớ tab đang xem để quay lại từ màn thêm món vẫn đúng tab.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage chỉ đọc được sau hydrate
    setTabState(readTab());
  }, []);
  const setTab = (next: Tab) => {
    setTabState(next);
    try {
      sessionStorage.setItem(TAB_KEY, next);
    } catch {}
  };

  if (g === null) {
    return (
      <>
        <PageHeader title="" />
        <p className="p-6 text-center text-muted" data-testid="group-not-found">
          {t("groupNotFound")}
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={g?.group.name ?? ""}
        action={
          g &&
          !g.group.deletedAt && (
            <button
              type="button"
              onClick={() => setInviting(true)}
              className="min-h-11 shrink-0 rounded-full px-4 text-[16px] font-semibold active:bg-line"
            >
              {t("invite")}
            </button>
          )
        }
      />
      {g && (
        <>
          <div role="tablist" aria-label={g.group.name} className="mx-4 mt-1 grid grid-cols-4 gap-1 rounded-2xl bg-line p-1">
            {TABS.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={tab === x.id}
                onClick={() => setTab(x.id)}
                className={`min-h-11 rounded-xl text-sm font-semibold ${tab === x.id ? "bg-surface shadow-sm" : "text-muted"}`}
              >
                {t(x.key)}
              </button>
            ))}
          </div>
          <main className="flex flex-1 flex-col gap-4 px-4 pt-3 pb-24">
            {g.group.deletedAt && <p className="rounded-2xl bg-line/60 p-3 text-sm">{t("groupDeletedBanner")}</p>}
            {tab === "expenses" && <ExpensesTab g={g} />}
            {tab === "result" && <ResultTab g={g} />}
            {tab === "members" && <MembersTab g={g} />}
            {tab === "history" && <HistoryTab g={g} />}
          </main>
          {inviting && <InviteSheet group={g} onClose={() => setInviting(false)} />}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Chi tiêu
// ---------------------------------------------------------------------------

function ItemRow({ item, g }: { item: Expense; g: GroupView }) {
  const t = useGroupsT();
  const name = (id: string | null) => (id ? (g.names.get(id) ?? "?") : "?");
  const sub =
    item.kind === "settlement"
      ? formatDateTime(item.occurredAt)
      : `${t("paidBy", { name: name(item.payerMemberId) })} · ${
          (item.shares ?? []).length >= g.active.length ? t("forAll") : t("forSome", { n: (item.shares ?? []).length })
        }`;
  return (
    <Link
      href={`/chia-tien/mon/?g=${g.group.id}&id=${item.id}`}
      className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-line"
      data-testid="item-row"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-medium">
          {item.kind === "settlement" ? t("settlementLine", { from: name(item.payerMemberId), to: name(item.toMemberId) }) : item.title}
        </span>
        <span className="block truncate text-sm text-muted">{sub}</span>
      </span>
      <span className="tabular shrink-0 text-[16px] font-semibold">{formatMoney(item.amount)}</span>
    </Link>
  );
}

function ExpensesTab({ g }: { g: GroupView }) {
  const t = useGroupsT();
  const toast = useToast();
  const [showDeleted, setShowDeleted] = useState(false);
  const newestFirst = (a: Expense, b: Expense) => b.occurredAt - a.occurredAt || b.createdAt - a.createdAt;
  const items = g.items.filter((i) => !i.deletedAt).sort(newestFirst);
  const deleted = g.items.filter((i) => i.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

  return (
    <>
      {!g.group.deletedAt && (
        <Link
          href={`/chia-tien/mon/?g=${g.group.id}`}
          className="grid min-h-16 place-items-center rounded-3xl bg-add text-xl font-bold text-white shadow-sm active:bg-add-press"
        >
          + {t("addExpense")}
        </Link>
      )}
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">{t("noExpenses")}</p>
      ) : (
        <ul className={`${card} overflow-hidden`} data-testid="item-list">
          {items.map((i) => (
            <li key={i.id} className="border-b border-line last:border-b-0">
              <ItemRow item={i} g={g} />
            </li>
          ))}
        </ul>
      )}
      {deleted.length > 0 && (
        <section className="flex flex-col gap-2">
          <button type="button" onClick={() => setShowDeleted((v) => !v)} className="self-start text-[15px] font-medium text-muted underline">
            {t("deletedItems", { n: deleted.length })}
          </button>
          {showDeleted && (
            <ul className={`${card} overflow-hidden`} data-testid="deleted-items">
              {deleted.map((i) => (
                <li key={i.id} className="flex min-h-14 items-center gap-3 border-b border-line px-4 py-2 opacity-80 last:border-b-0">
                  <span className="min-w-0 flex-1 truncate">{itemLabel(i, g.names, t)}</span>
                  <button
                    type="button"
                    className={secondaryBtn}
                    onClick={() => restoreExpense(i.id).then(() => toast({ message: t("itemRestored"), showOn: GROUP_PATH }))}
                  >
                    {t("restore")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Kết quả
// ---------------------------------------------------------------------------

function ResultTab({ g }: { g: GroupView }) {
  const t = useGroupsT();
  const toast = useToast();
  const [paying, setPaying] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => g.names.get(id) ?? "?";

  async function savePaid(e: FormEvent, from: string, to: string) {
    e.preventDefault();
    try {
      await saveSettlement({ groupId: g.group.id, from, to, amount });
      setPaying(null);
      toast({ message: t("paidSaved", { from: name(from), to: name(to), amount: formatMoney(amount) }), showOn: GROUP_PATH });
    } catch (err) {
      setError(t(groupErrorKey(err instanceof GroupError ? err.code : "")));
    }
  }

  return (
    <>
      {g.settled && (
        <p className="rounded-2xl bg-pay/15 p-4 text-center text-lg font-bold text-pay" data-testid="settled">
          {t("settledUp")}
        </p>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-semibold text-muted">{t("transfers")}</h2>
        {g.transfers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-4 text-center text-muted">{t("nothingToSettle")}</p>
        ) : (
          <ul className={`${card} overflow-hidden`} data-testid="transfers">
            {g.transfers.map((tr, i) => (
              <li key={`${tr.from}-${tr.to}`} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0" data-testid="transfer">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">
                    {name(tr.from)} → {name(tr.to)}
                  </span>
                  <span className="tabular shrink-0 text-[16px] font-bold">{formatMoney(tr.amount)}</span>
                </div>
                {paying === i ? (
                  <form onSubmit={(e) => savePaid(e, tr.from, tr.to)} className="flex flex-col gap-2">
                    <AmountField id="paid" label={t("paidAmount")} hint={t("amountHint")} value={amount} onChange={setAmount} autoFocus />
                    <ErrorText>{error}</ErrorText>
                    <div className="flex gap-2">
                      <button type="button" className={`${secondaryBtn} flex-1`} onClick={() => setPaying(null)}>
                        {t("cancel")}
                      </button>
                      <button type="submit" disabled={amount <= 0} className={`${primaryBtn} flex-1`}>
                        {t("savePaid")}
                      </button>
                    </div>
                  </form>
                ) : (
                  !g.group.deletedAt && (
                    <button
                      type="button"
                      className={`${secondaryBtn} self-start`}
                      onClick={() => {
                        setPaying(i);
                        setAmount(tr.amount);
                        setError(null);
                      }}
                    >
                      {t("markPaid")}
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
        {!g.group.deletedAt && g.active.length >= 2 && (
          <Link href={`/chia-tien/mon/?g=${g.group.id}&kind=settlement`} className="self-start px-1 text-[15px] font-medium text-muted underline">
            {t("otherSettlement")}
          </Link>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-semibold text-muted">{t("balances")}</h2>
        <ul className={`${card} overflow-hidden`} data-testid="balances">
          {g.active.map((m) => {
            const b = g.balances.get(m.id) ?? 0;
            return (
              <li key={m.id} className="flex min-h-12 items-center gap-3 border-b border-line px-4 py-2 last:border-b-0">
                <span className="min-w-0 flex-1 truncate">
                  {m.name}
                  {m.id === g.me?.id && <span className="text-muted"> ({t("you")})</span>}
                </span>
                <span className={`tabular shrink-0 font-semibold ${b > 0 ? "text-pay" : b < 0 ? "text-add" : "text-muted"}`}>
                  {b === 0 ? "0 đ" : `${b > 0 ? t("gets") : t("owes")} ${formatMoney(Math.abs(b))}`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Thành viên
// ---------------------------------------------------------------------------

function MemberRow({ m, g }: { m: GroupMember; g: GroupView }) {
  const t = useGroupsT();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(m.name);
  const [weight, setWeight] = useState(m.weight);
  const [error, setError] = useState<string | null>(null);
  const fail = (err: unknown) => setError(t(groupErrorKey(err instanceof GroupError ? err.code : "")));

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await editMember(m.id, { name, weight });
      setEditing(false);
      setError(null);
    } catch (err) {
      fail(err);
    }
  }

  return (
    <li className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0" data-testid="member-row">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{m.name}</span>
        {m.id === g.me?.id ? <Badge tone="strong">{t("you")}</Badge> : <Badge>{m.userId ? t("linked") : t("guest")}</Badge>}
        <span className="shrink-0 text-sm text-muted">{t("shares", { n: m.weight })}</span>
        {!editing && !g.group.deletedAt && (
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-full px-3 font-semibold active:bg-line"
            onClick={() => {
              setName(m.name);
              setWeight(m.weight);
              setEditing(true);
            }}
          >
            {t("editMember")}
          </button>
        )}
      </div>
      {editing && (
        <form onSubmit={save} className="flex flex-col gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label={t("guestName")} maxLength={200} className={input} />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">{t("sharesLabel")}</span>
            <WeightStepper value={weight} onChange={setWeight} label={t("sharesLabel")} />
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <button type="button" className={`${secondaryBtn} flex-1`} onClick={() => setEditing(false)}>
              {t("cancel")}
            </button>
            <button type="submit" className={`${primaryBtn} flex-1`}>
              {t("save")}
            </button>
          </div>
          {m.id !== g.me?.id && (
            <button
              type="button"
              className={dangerBtn}
              onClick={() => {
                // Giải thích ngay khi không xoá được (spec "Xoá thành viên").
                if (m.userId || isMemberInUse(m.id, g.items)) return setError(t("memberInUse"));
                removeMember(m.id).catch(fail);
              }}
            >
              {t("removeMember")}
            </button>
          )}
        </form>
      )}
    </li>
  );
}

function MembersTab({ g }: { g: GroupView }) {
  const t = useGroupsT();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [weight, setWeight] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "leave" | "delete" | "rename">(null);
  const [groupName, setGroupName] = useState(g.group.name);
  const [busy, setBusy] = useState(false);
  const fail = (code: string) => setError(t(groupErrorKey(code)));

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await addGuest(g.group.id, { name, weight });
      setName("");
      setWeight(1);
      setError(null);
    } catch (err) {
      fail(err instanceof GroupError ? err.code : "");
    }
  }

  async function leave() {
    if (g.myBalance !== 0) {
      return setError(
        g.myBalance < 0 ? t("notSettled", { amount: formatMoney(-g.myBalance) }) : t("notSettledGet", { amount: formatMoney(g.myBalance) }),
      );
    }
    setBusy(true);
    const res = await groupApi().leave(g.group.id);
    setBusy(false);
    if (!res.ok) {
      if (res.error === "not_settled" && res.balance !== undefined) {
        return setError(
          res.balance < 0 ? t("notSettled", { amount: formatMoney(-res.balance) }) : t("notSettledGet", { amount: formatMoney(res.balance) }),
        );
      }
      return fail(res.error);
    }
    await dropGroupLocal(g.group.id);
    router.replace("/chia-tien/");
    toast({ message: t("left"), showOn: "/chia-tien/" });
  }

  async function remove() {
    setBusy(true);
    const res = await groupApi().remove(g.group.id);
    setBusy(false);
    if (!res.ok) return fail(res.error);
    const { syncNow } = await import("@/lib/sync");
    await syncNow({ groups: true });
    router.replace("/chia-tien/");
    toast({ message: t("groupDeleted"), showOn: "/chia-tien/" });
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    try {
      await renameGroup(g.group.id, groupName);
      setConfirm(null);
    } catch (err) {
      fail(err instanceof GroupError ? err.code : "");
    }
  }

  return (
    <>
      <ul className={`${card} overflow-hidden`} data-testid="members">
        {g.active.map((m) => (
          <MemberRow key={m.id} m={m} g={g} />
        ))}
      </ul>

      {!g.group.deletedAt && (
        <form onSubmit={add} className={`${card} flex flex-col gap-2 p-4`} data-testid="add-guest">
          <span className="text-sm font-semibold">{t("addGuest")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("guestNamePlaceholder")} aria-label={t("guestName")} maxLength={200} className={input} />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">{t("sharesLabel")}</span>
            <WeightStepper value={weight} onChange={setWeight} label={t("sharesLabel")} />
          </div>
          <button type="submit" disabled={!name.trim()} className={primaryBtn}>
            {t("add")}
          </button>
        </form>
      )}

      <ErrorText>{error}</ErrorText>

      <section className="flex flex-col gap-2">
        {confirm === "rename" ? (
          <form onSubmit={rename} className={`${card} flex flex-col gap-2 p-4`}>
            <input autoFocus value={groupName} onChange={(e) => setGroupName(e.target.value)} aria-label={t("groupName")} maxLength={200} className={input} />
            <div className="flex gap-2">
              <button type="button" className={`${secondaryBtn} flex-1`} onClick={() => setConfirm(null)}>
                {t("cancel")}
              </button>
              <button type="submit" className={`${primaryBtn} flex-1`}>
                {t("save")}
              </button>
            </div>
          </form>
        ) : (
          !g.group.deletedAt && (
            <button type="button" className={secondaryBtn} onClick={() => setConfirm("rename")}>
              {t("renameGroup")}
            </button>
          )
        )}

        {confirm === "leave" ? (
          <div className={`${card} flex flex-col gap-2 p-4`} data-testid="leave-confirm">
            <p className="text-sm">{t("leaveConfirm", { name: g.group.name })}</p>
            {g.isCreator && <p className="rounded-lg bg-amber-100 p-2 text-sm text-amber-900">{t("leaveCreatorWarn")}</p>}
            <div className="flex gap-2">
              <button type="button" className={`${secondaryBtn} flex-1`} onClick={() => setConfirm(null)}>
                {t("cancel")}
              </button>
              <button type="button" disabled={busy} className={`${dangerBtn} flex-1`} onClick={leave}>
                {t("leaveGroup")}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={dangerBtn} onClick={() => setConfirm("leave")}>
            {t("leaveGroup")}
          </button>
        )}

        {g.isCreator &&
          !g.group.deletedAt &&
          (confirm === "delete" ? (
            <div className={`${card} flex flex-col gap-2 p-4`} data-testid="delete-group-confirm">
              <p className="text-sm">{t("deleteGroupConfirm", { name: g.group.name })}</p>
              <div className="flex gap-2">
                <button type="button" className={`${secondaryBtn} flex-1`} onClick={() => setConfirm(null)}>
                  {t("cancel")}
                </button>
                <button type="button" disabled={busy} className={`${dangerBtn} flex-1`} onClick={remove}>
                  {t("deleteGroup")}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={dangerBtn} onClick={() => setConfirm("delete")}>
              {t("deleteGroup")}
            </button>
          ))}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Lịch sử
// ---------------------------------------------------------------------------

function HistoryTab({ g }: { g: GroupView }) {
  const t = useGroupsT();
  const events = [...g.events].sort((a, b) => b.at - a.at);
  if (events.length === 0) return <p className="p-4 text-center text-muted">{t("groupNoHistory")}</p>;
  return (
    <ul className={`${card} overflow-hidden`} data-testid="group-history">
      {events.map((e) => (
        <li key={e.id} className="flex flex-col border-b border-line px-4 py-2 last:border-b-0" data-testid="history-line">
          <span className="text-[15px]">{describeEvent(e, g, t)}</span>
          <span className="text-xs text-muted">{formatDateTime(e.at)}</span>
        </li>
      ))}
    </ul>
  );
}
