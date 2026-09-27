"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatDateTime } from "@/lib/date";
import { deleteExpense, GroupError, restoreExpense, saveExpense, saveSettlement } from "@/lib/groups/groups";
import { useGroup } from "@/lib/groups/hooks";
import type { GroupView } from "@/lib/groups/view";
import { groupErrorKey, useGroupsT } from "@/lib/i18n/groups";
import { formatMoney } from "@/lib/money";
import { useQueryParam } from "@/lib/nav";
import { computeShares } from "@/lib/split";
import { PageHeader, useGoBack } from "../PageHeader";
import { useToast } from "../Toast";
import { describeEvent } from "./history";
import { AmountField, card, dangerBtn, ErrorText, GROUP_PATH, input, WeightStepper } from "./ui";

export function ExpenseForm() {
  const t = useGroupsT();
  const groupId = useQueryParam("g");
  const itemId = useQueryParam("id");
  const kindParam = useQueryParam("kind");
  const g = useGroup(groupId);

  if (g === null) {
    return (
      <>
        <PageHeader title="" />
        <p className="p-6 text-center text-muted">{t("groupNotFound")}</p>
      </>
    );
  }
  if (!g) return <PageHeader title="" />;
  const existing = itemId ? g.items.find((i) => i.id === itemId) : undefined;
  if (itemId && !existing) {
    return (
      <>
        <PageHeader title="" />
        <p className="p-6 text-center text-muted">{t("errNotFound")}</p>
      </>
    );
  }
  const kind = existing?.kind ?? (kindParam === "settlement" ? "settlement" : "expense");
  // key: đổi món (vd. mở từ lịch sử) thì dựng lại form với giá trị mới.
  return <Form key={itemId ?? "new"} g={g} itemId={itemId} kind={kind} />;
}

function Form({ g, itemId, kind }: { g: GroupView; itemId: string | null; kind: "expense" | "settlement" }) {
  const t = useGroupsT();
  const toast = useToast();
  const goBack = useGoBack();
  const existing = itemId ? g.items.find((i) => i.id === itemId) : undefined;
  const me = g.me?.id ?? g.active[0]?.id ?? "";
  const other = g.active.find((m) => m.id !== me)?.id ?? "";

  const [title, setTitle] = useState(existing?.title ?? "");
  const [amount, setAmount] = useState(existing?.amount ?? 0);
  const [payer, setPayer] = useState(existing?.payerMemberId ?? me);
  const [to, setTo] = useState(existing?.toMemberId ?? other);
  // Người cùng chia và số suất riêng cho món này; 0 = không chia.
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      g.active.map((m) => [m.id, existing ? (existing.shares?.find((s) => s.memberId === m.id)?.weight ?? 0) : m.weight]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!existing && kind === "expense") titleRef.current?.focus();
  }, [existing, kind]);

  const shares = g.active.filter((m) => (weights[m.id] ?? 0) > 0).map((m) => ({ memberId: m.id, weight: weights[m.id] }));
  const parts = computeShares(amount, shares, g.members);
  const allOn = g.active.every((m) => (weights[m.id] ?? 0) > 0);
  const name = (id: string) => g.names.get(id) ?? "?";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (kind === "expense") {
        await saveExpense({ id: existing?.id, groupId: g.group.id, title, amount, payerMemberId: payer, shares });
      } else {
        await saveSettlement({ id: existing?.id, groupId: g.group.id, from: payer, to, amount });
      }
      goBack();
    } catch (err) {
      setSaving(false);
      setError(t(groupErrorKey(err instanceof GroupError ? err.code : "")));
    }
  }

  async function remove() {
    if (!existing) return;
    await deleteExpense(existing.id);
    goBack();
    toast({
      message: t("itemDeleted", { title: kind === "expense" ? existing.title : t("settlementLine", { from: name(existing.payerMemberId), to: name(existing.toMemberId ?? "") }) }),
      actionLabel: t("undo"),
      onAction: () => void restoreExpense(existing.id).then(() => toast({ message: t("itemRestored"), showOn: GROUP_PATH })),
      showOn: GROUP_PATH,
    });
  }

  const title_ = existing ? (kind === "expense" ? t("editExpense") : t("editSettlement")) : kind === "expense" ? t("newExpense") : t("newSettlement");
  const chip = (active: boolean) =>
    `min-h-11 rounded-full border-2 px-4 text-[15px] font-semibold ${active ? "border-foreground bg-foreground text-background" : "border-line bg-surface"}`;
  const history = itemId ? g.events.filter((e) => e.entityId === itemId).sort((a, b) => b.at - a.at) : [];

  return (
    <>
      <PageHeader title={title_} />
      <form onSubmit={submit} className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-10" noValidate>
        {kind === "expense" && (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted">{t("itemTitle")}</span>
            <input
              ref={titleRef}
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("itemTitlePlaceholder")}
              maxLength={200}
              enterKeyHint="next"
              className={`${input} min-h-14 text-lg`}
            />
          </label>
        )}

        <AmountField id="amount" label={t("amount")} hint={t("amountHint")} value={amount} onChange={setAmount} autoFocus={kind === "settlement" && !existing} />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-muted">{kind === "expense" ? t("whoPaid") : t("from")}</legend>
          <div className="flex flex-wrap gap-2" data-testid="payer">
            {g.active.map((m) => (
              <button key={m.id} type="button" aria-pressed={payer === m.id} onClick={() => setPayer(m.id)} className={chip(payer === m.id)}>
                {m.name}
              </button>
            ))}
          </div>
        </fieldset>

        {kind === "settlement" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-muted">{t("to")}</legend>
            <div className="flex flex-wrap gap-2" data-testid="receiver">
              {g.active.map((m) => (
                <button key={m.id} type="button" aria-pressed={to === m.id} onClick={() => setTo(m.id)} className={chip(to === m.id)}>
                  {m.name}
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <legend className="text-sm font-medium text-muted">{t("splitFor")}</legend>
              <button
                type="button"
                aria-pressed={allOn}
                onClick={() => setWeights(Object.fromEntries(g.active.map((m) => [m.id, allOn ? 0 : weights[m.id] || m.weight])))}
                className="min-h-11 px-2 text-[15px] font-semibold underline"
              >
                {t("selectAll")}
              </button>
            </div>
            <ul className={`${card} overflow-hidden`} data-testid="participants">
              {g.active.map((m) => {
                const on = (weights[m.id] ?? 0) > 0;
                return (
                  <li key={m.id} className="flex min-h-14 items-center gap-2 border-b border-line px-3 py-1 last:border-b-0">
                    <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setWeights({ ...weights, [m.id]: on ? 0 : m.weight })}
                        className="size-6 shrink-0 accent-foreground"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[16px] font-medium">{m.name}</span>
                        {on && amount > 0 && <span className="tabular block text-sm text-muted">{formatMoney(parts.get(m.id) ?? 0)}</span>}
                      </span>
                    </label>
                    {on && (
                      <WeightStepper value={weights[m.id]} onChange={(v) => setWeights({ ...weights, [m.id]: v })} label={`${t("sharesLabel")} ${m.name}`} />
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}

        <ErrorText>{error}</ErrorText>

        <button
          type="submit"
          disabled={saving || amount <= 0 || (kind === "expense" && !title.trim())}
          className="min-h-16 rounded-2xl bg-add text-xl font-bold text-white shadow-sm active:bg-add-press disabled:opacity-40"
        >
          {t("save")}
        </button>

        {existing && !existing.deletedAt && (
          <button type="button" onClick={remove} className={dangerBtn}>
            {kind === "expense" ? t("deleteItem") : t("deleteSettlement")}
          </button>
        )}

        {history.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-semibold text-muted">{t("itemHistory")}</h2>
            <ul className={`${card} overflow-hidden`} data-testid="item-history">
              {history.map((e) => (
                <li key={e.id} className="flex flex-col border-b border-line px-4 py-2 last:border-b-0">
                  <span className="text-[15px]">{describeEvent(e, g, t)}</span>
                  <span className="text-xs text-muted">{formatDateTime(e.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </form>
    </>
  );
}
