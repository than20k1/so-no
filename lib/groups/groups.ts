// Thao tác nhóm chia tiền trên máy: lưu ngay (offline được), đánh dấu chờ đẩy, kèm lịch sử (spec group-expenses).
import { newId } from "../id";
import { getContext, getDb, getMeta, setMeta } from "../ledger/db";
import type { Expense, GroupEvent, GroupMember } from "../ledger/types";
import { cleanDisplayName, normalizeName } from "../text";
import { GROUP_LIMITS, type GroupEventEntity, type GroupEventKind, type WireShare } from "./wire";

export const SELF_NAME_META = "groupSelfName";
const ACCOUNT_META = "accountUserId";

export type GroupErrorCode =
  | "not_logged_in"
  | "empty_name"
  | "name_too_long"
  | "name_taken"
  | "invalid_weight"
  | "too_many_members"
  | "member_in_use"
  | "invalid_amount"
  | "no_participants"
  | "same_person"
  | "not_found";

export class GroupError extends Error {
  constructor(public code: GroupErrorCode) {
    super(code);
  }
}

let lastStamp = 0;
/** Thời điểm tăng dần trên máy — các thay đổi liên tiếp không trùng mốc, lịch sử luôn đúng thứ tự. */
function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

function cleanName(input: string): string {
  const name = cleanDisplayName(input);
  if (!name) throw new GroupError("empty_name");
  if (name.length > GROUP_LIMITS.maxText) throw new GroupError("name_too_long");
  return name;
}

function checkWeight(w: number) {
  if (!Number.isInteger(w) || w < 1 || w > GROUP_LIMITS.maxWeight) throw new GroupError("invalid_weight");
}

function checkAmount(a: number) {
  if (!Number.isInteger(a) || a < 1 || a > GROUP_LIMITS.maxAmount) throw new GroupError("invalid_amount");
}

async function userId(): Promise<string> {
  const id = await getMeta<string>(ACCOUNT_META);
  if (!id) throw new GroupError("not_logged_in");
  return id;
}

async function event(
  groupId: string,
  entity: GroupEventEntity,
  entityId: string,
  kind: GroupEventKind,
  before: unknown,
  after: unknown,
  at: number,
) {
  const { deviceId } = await getContext();
  const e: GroupEvent = { id: newId(), groupId, entity, entityId, kind, before, after, at: Math.max(at, stamp()), deviceId };
  await getDb().groupEvents.add(e);
}

async function activeMembers(groupId: string): Promise<GroupMember[]> {
  return (await getDb().groupMembers.where("groupId").equals(groupId).toArray()).filter((m) => !m.removedAt);
}

async function assertNameFree(groupId: string, name: string, exceptId?: string) {
  const key = normalizeName(name);
  if ((await activeMembers(groupId)).some((m) => m.id !== exceptId && m.searchKey === key)) throw new GroupError("name_taken");
}

// ---------------------------------------------------------------------------
// Nhóm
// ---------------------------------------------------------------------------

/** Tạo nhóm với chính mình là thành viên đầu tiên (1 suất). Trả id nhóm. */
export async function createGroup(input: { name: string; selfName: string }): Promise<string> {
  const me = await userId();
  const name = cleanName(input.name);
  const selfName = cleanName(input.selfName);
  await getContext();
  const d = getDb();
  const now = stamp();
  const groupId = newId();
  const memberId = newId();
  await d.transaction("rw", [d.groups, d.groupMembers, d.groupEvents, d.meta], async () => {
    await d.groups.add({ id: groupId, name, createdByUserId: me, createdAt: now, updatedAt: now, deletedAt: null });
    await d.groupMembers.add({
      id: memberId, groupId, name: selfName, searchKey: normalizeName(selfName), weight: 1, userId: me,
      orderKey: now, createdAt: now, updatedAt: now, removedAt: null,
    });
    await event(groupId, "group", groupId, "create", null, { name }, now);
    await event(groupId, "member", memberId, "create", null, { name: selfName, weight: 1 }, now);
    await setMeta(SELF_NAME_META, selfName);
  });
  return groupId;
}

export async function renameGroup(groupId: string, input: string): Promise<void> {
  const name = cleanName(input);
  await getContext();
  const d = getDb();
  await d.transaction("rw", [d.groups, d.groupEvents, d.meta], async () => {
    const g = await d.groups.get(groupId);
    if (!g) throw new GroupError("not_found");
    if (g.name === name) return;
    const now = stamp();
    await d.groups.update(groupId, { name, updatedAt: now });
    await event(groupId, "group", groupId, "edit", { name: g.name }, { name }, now);
  });
}

// ---------------------------------------------------------------------------
// Thành viên
// ---------------------------------------------------------------------------

export async function addGuest(groupId: string, input: { name: string; weight?: number }): Promise<string> {
  const name = cleanName(input.name);
  const weight = input.weight ?? 1;
  checkWeight(weight);
  await getContext();
  const d = getDb();
  const id = newId();
  await d.transaction("rw", [d.groupMembers, d.groupEvents, d.meta], async () => {
    const active = await activeMembers(groupId);
    if (active.length >= GROUP_LIMITS.maxMembers) throw new GroupError("too_many_members");
    await assertNameFree(groupId, name);
    const now = stamp();
    await d.groupMembers.add({
      id, groupId, name, searchKey: normalizeName(name), weight, userId: null,
      orderKey: now, createdAt: now, updatedAt: now, removedAt: null,
    });
    await event(groupId, "member", id, "create", null, { name, weight }, now);
  });
  return id;
}

export async function editMember(memberId: string, input: { name?: string; weight?: number }): Promise<void> {
  await getContext();
  const d = getDb();
  await d.transaction("rw", [d.groupMembers, d.groupEvents, d.meta], async () => {
    const m = await d.groupMembers.get(memberId);
    if (!m || m.removedAt) throw new GroupError("not_found");
    const name = input.name === undefined ? m.name : cleanName(input.name);
    const weight = input.weight ?? m.weight;
    checkWeight(weight);
    if (name === m.name && weight === m.weight) return;
    if (name !== m.name) await assertNameFree(m.groupId, name, m.id);
    const now = stamp();
    await d.groupMembers.update(memberId, { name, searchKey: normalizeName(name), weight, updatedAt: now });
    await event(m.groupId, "member", memberId, "edit", { name: m.name, weight: m.weight }, { name, weight }, now);
  });
}

/** Thành viên đã dính món / dòng thanh toán nào (kể cả đã xoá) — không xoá được. */
export function isMemberInUse(memberId: string, items: readonly Expense[]): boolean {
  return items.some(
    (e) => e.payerMemberId === memberId || e.toMemberId === memberId || (e.shares ?? []).some((s) => s.memberId === memberId),
  );
}

export async function removeMember(memberId: string): Promise<void> {
  await getContext();
  const d = getDb();
  await d.transaction("rw", [d.groupMembers, d.expenses, d.groupEvents, d.meta], async () => {
    const m = await d.groupMembers.get(memberId);
    if (!m || m.removedAt) throw new GroupError("not_found");
    const items = await d.expenses.where("groupId").equals(m.groupId).toArray();
    if (m.userId !== null || isMemberInUse(m.id, items)) throw new GroupError("member_in_use");
    const now = stamp();
    await d.groupMembers.update(memberId, { removedAt: now, updatedAt: now });
    await event(m.groupId, "member", memberId, "remove", { name: m.name, weight: m.weight }, null, now);
  });
}

// ---------------------------------------------------------------------------
// Món chi tiêu và dòng thanh toán
// ---------------------------------------------------------------------------

/** Bản chụp dùng cho lịch sử — đủ để hiện "trước → sau". */
function snapshot(e: Expense) {
  return { kind: e.kind, title: e.title, amount: e.amount, payerMemberId: e.payerMemberId, toMemberId: e.toMemberId, shares: e.shares };
}

async function saveItem(next: Omit<Expense, "createdAt" | "updatedAt" | "deletedAt" | "occurredAt">): Promise<string> {
  await getContext();
  const d = getDb();
  await d.transaction("rw", [d.expenses, d.groupMembers, d.groupEvents, d.meta], async () => {
    const members = new Set((await activeMembers(next.groupId)).map((m) => m.id));
    const refs = [next.payerMemberId, ...(next.toMemberId ? [next.toMemberId] : []), ...(next.shares ?? []).map((s) => s.memberId)];
    const cur = await d.expenses.get(next.id);
    // Người đã dính món không xoá được, nên mọi người trong món luôn còn trong nhóm.
    if (refs.some((id) => !members.has(id))) throw new GroupError("not_found");
    const now = stamp();
    if (!cur) {
      const row: Expense = { ...next, occurredAt: now, createdAt: now, updatedAt: now, deletedAt: null };
      await d.expenses.add(row);
      await event(next.groupId, "expense", next.id, "create", null, snapshot(row), now);
      return;
    }
    if (cur.groupId !== next.groupId) throw new GroupError("not_found");
    const row: Expense = { ...cur, ...next, updatedAt: now };
    if (JSON.stringify(snapshot(row)) === JSON.stringify(snapshot(cur))) return;
    await d.expenses.put(row);
    await event(next.groupId, "expense", next.id, "edit", snapshot(cur), snapshot(row), now);
  });
  return next.id;
}

export async function saveExpense(input: {
  id?: string;
  groupId: string;
  title: string;
  amount: number;
  payerMemberId: string;
  shares: WireShare[];
}): Promise<string> {
  const title = cleanName(input.title);
  checkAmount(input.amount);
  const shares = input.shares.filter((s) => s.weight > 0);
  if (shares.length === 0) throw new GroupError("no_participants");
  shares.forEach((s) => checkWeight(s.weight));
  return saveItem({
    id: input.id ?? newId(),
    groupId: input.groupId,
    kind: "expense",
    title,
    amount: input.amount,
    payerMemberId: input.payerMemberId,
    toMemberId: null,
    shares,
  });
}

/** "A đã trả B <số tiền>". */
export async function saveSettlement(input: { id?: string; groupId: string; from: string; to: string; amount: number }): Promise<string> {
  checkAmount(input.amount);
  if (input.from === input.to) throw new GroupError("same_person");
  return saveItem({
    id: input.id ?? newId(),
    groupId: input.groupId,
    kind: "settlement",
    title: "",
    amount: input.amount,
    payerMemberId: input.from,
    toMemberId: input.to,
    shares: null,
  });
}

async function setDeleted(id: string, deleted: boolean): Promise<void> {
  await getContext();
  const d = getDb();
  await d.transaction("rw", [d.expenses, d.groupEvents, d.meta], async () => {
    const cur = await d.expenses.get(id);
    if (!cur) throw new GroupError("not_found");
    if (Boolean(cur.deletedAt) === deleted) return;
    const now = stamp();
    await d.expenses.update(id, { deletedAt: deleted ? now : null, updatedAt: now });
    await event(cur.groupId, "expense", id, deleted ? "delete" : "restore", null, snapshot(cur), now);
  });
}

export const deleteExpense = (id: string) => setDeleted(id, true);
export const restoreExpense = (id: string) => setDeleted(id, false);

// ---------------------------------------------------------------------------
// Dọn dữ liệu nhóm trên máy
// ---------------------------------------------------------------------------

export const GROUP_CURSORS_META = "groupCursors";

/** Xoá bản sao một nhóm trên máy (đã rời / không còn quyền). */
export async function dropGroupLocal(groupId: string): Promise<void> {
  const d = getDb();
  await d.transaction("rw", [d.groups, d.groupMembers, d.expenses, d.groupEvents, d.meta], async () => {
    await d.groups.delete(groupId);
    await d.groupMembers.where("groupId").equals(groupId).delete();
    await d.expenses.where("groupId").equals(groupId).delete();
    await d.groupEvents.where("groupId").equals(groupId).delete();
    const cursors = (await getMeta<Record<string, number>>(GROUP_CURSORS_META)) ?? {};
    delete cursors[groupId];
    await setMeta(GROUP_CURSORS_META, cursors);
  });
}

/** Xoá mọi dữ liệu nhóm trên máy — khi đăng xuất hoặc đổi tài khoản (delta user-account). */
export async function wipeGroups(): Promise<void> {
  const d = getDb();
  await d.transaction("rw", [d.groups, d.groupMembers, d.expenses, d.groupEvents, d.meta], async () => {
    await Promise.all([d.groups.clear(), d.groupMembers.clear(), d.expenses.clear(), d.groupEvents.clear()]);
    await d.meta.delete(GROUP_CURSORS_META);
  });
}

/** Số dòng nhóm còn chờ gửi — để cảnh báo trước khi đăng xuất. */
export async function pendingGroupCount(): Promise<number> {
  const d = getDb();
  const counts = await Promise.all(
    [d.groups, d.groupMembers, d.expenses, d.groupEvents].map((t) => (t as typeof d.groups).where("_dirty").equals(1).count()),
  );
  return counts.reduce((a, b) => a + b, 0);
}
