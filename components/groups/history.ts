// Câu mô tả lịch sử nhóm: "Hùng sửa Vịt 180.000 đ: số tiền 180.000 đ → 200.000 đ" (spec "Lịch sử thay đổi của nhóm").
import type { GroupView } from "@/lib/groups/view";
import type { useGroupsT } from "@/lib/i18n/groups";
import type { Expense, GroupEvent } from "@/lib/ledger/types";
import { formatMoney } from "@/lib/money";

type T = ReturnType<typeof useGroupsT>;
type ItemSnap = Pick<Expense, "kind" | "title" | "amount" | "payerMemberId" | "toMemberId" | "shares">;
type MemberSnap = { name?: string; weight?: number };

const nameOf = (names: Map<string, string>, id: string | null | undefined) => (id ? (names.get(id) ?? "?") : "?");

/** "Vịt 180.000 đ" hoặc "An đã trả Hùng 216.000 đ". */
export function itemLabel(item: ItemSnap, names: Map<string, string>, t: T): string {
  const what =
    item.kind === "settlement"
      ? t("settlementLine", { from: nameOf(names, item.payerMemberId), to: nameOf(names, item.toMemberId) })
      : item.title;
  return `${what} ${formatMoney(item.amount)}`;
}

function memberLabel(m: MemberSnap | null, t: T): string {
  return `${m?.name ?? "?"} (${t("shares", { n: m?.weight ?? 1 })})`;
}

function changes(before: ItemSnap, after: ItemSnap, names: Map<string, string>, t: T): string {
  const out: string[] = [];
  if (before.amount !== after.amount) out.push(t("chAmount", { before: formatMoney(before.amount), after: formatMoney(after.amount) }));
  if (before.title !== after.title) out.push(t("chTitle", { before: before.title, after: after.title }));
  if (before.payerMemberId !== after.payerMemberId)
    out.push(t("chPayer", { before: nameOf(names, before.payerMemberId), after: nameOf(names, after.payerMemberId) }));
  if (before.toMemberId !== after.toMemberId)
    out.push(t("chPayer", { before: nameOf(names, before.toMemberId), after: nameOf(names, after.toMemberId) }));
  if (JSON.stringify(before.shares) !== JSON.stringify(after.shares)) out.push(t("chShares"));
  return out.join(", ");
}

export function describeEvent(e: GroupEvent, g: Pick<GroupView, "names" | "me">, t: T): string {
  // Dòng chưa lên server thì chưa có người làm — là thay đổi của chính máy này.
  const actor = e.actorMemberId ? nameOf(g.names, e.actorMemberId) : e.userId ? t("someone") : (g.me?.name ?? t("someone"));
  const before = e.before as Record<string, unknown> | null;
  const after = e.after as Record<string, unknown> | null;

  if (e.entity === "group") {
    switch (e.kind) {
      case "create":
        return t("evGroupCreate", { actor, name: String(after?.name ?? "") });
      case "edit":
        return t("evGroupEdit", { actor, before: String(before?.name ?? ""), after: String(after?.name ?? "") });
      case "delete":
        return t("evGroupDelete", { actor });
      case "restore":
        return t("evGroupRestore", { actor });
      default:
        return t("evInviteReset", { actor });
    }
  }

  if (e.entity === "member") {
    const b = before as MemberSnap | null;
    const a = after as MemberSnap | null;
    switch (e.kind) {
      case "create":
        return t("evMemberCreate", { actor, name: a?.name ?? "?", shares: a?.weight ?? 1 });
      case "edit":
        return t("evMemberEdit", { actor, before: memberLabel(b, t), after: memberLabel(a, t) });
      case "remove":
        return t("evMemberRemove", { actor, name: b?.name ?? "?" });
      case "join":
        return t("evMemberJoin", { name: a?.name ?? actor });
      case "claim":
        return t("evMemberClaim", { name: a?.name ?? actor });
      default:
        return t("evMemberLeave", { name: b?.name ?? actor });
    }
  }

  const a = after as ItemSnap | null;
  const b = before as ItemSnap | null;
  const item = a ?? b;
  const label = item ? itemLabel(item, g.names, t) : "?";
  switch (e.kind) {
    case "create":
      return t("evExpenseCreate", { actor, item: label });
    case "edit":
      return t("evExpenseEdit", { actor, item: b ? itemLabel(b, g.names, t) : label, changes: a && b ? changes(b, a, g.names, t) : "" });
    case "delete":
      return t("evExpenseDelete", { actor, item: label });
    default:
      return t("evExpenseRestore", { actor, item: label });
  }
}
