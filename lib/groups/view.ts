// Tính sẵn những gì màn Chia tiền cần hiển thị từ dữ liệu thô của một nhóm (thuần, test được).
import type { Expense, Group, GroupEvent, GroupMember } from "../ledger/types";
import { balances, isSettled, settle, type Transfer } from "../split";

export interface GroupData {
  group: Group;
  /** Mọi thành viên (kể cả đã xoá — món cũ vẫn cần tên), theo thứ tự vào nhóm. */
  members: GroupMember[];
  items: Expense[];
  events: GroupEvent[];
}

export interface GroupView extends GroupData {
  active: GroupMember[];
  me: GroupMember | undefined;
  names: Map<string, string>;
  balances: Map<string, number>;
  transfers: Transfer[];
  total: number;
  myBalance: number;
  settled: boolean;
  lastActivity: number;
  isCreator: boolean;
}

export function viewGroup(data: GroupData, userId: string | null | undefined): GroupView {
  const members = [...data.members].sort((a, b) => a.orderKey - b.orderKey || (a.id < b.id ? -1 : 1));
  const bal = balances(members, data.items);
  const me = userId ? members.find((m) => m.userId === userId) : undefined;
  return {
    ...data,
    members,
    active: members.filter((m) => !m.removedAt),
    me,
    names: new Map(members.map((m) => [m.id, m.name])),
    balances: bal,
    transfers: settle(bal, members),
    total: data.items.filter((i) => !i.deletedAt && i.kind === "expense").reduce((s, i) => s + i.amount, 0),
    myBalance: me ? (bal.get(me.id) ?? 0) : 0,
    settled: isSettled(bal, data.items),
    lastActivity: Math.max(data.group.updatedAt, ...data.events.map((e) => e.at), ...data.items.map((i) => i.updatedAt)),
    isCreator: !!userId && data.group.createdByUserId === userId,
  };
}
