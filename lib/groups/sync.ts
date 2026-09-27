// Một lượt đồng bộ nhóm: đẩy dòng chờ theo lô, kéo theo con trỏ từng nhóm, bỏ nhóm mất quyền (design D8).
import { getDb, getMeta, markRemoteWrite, setMeta } from "../ledger/db";
import type { Expense, Group, GroupEvent, GroupMember } from "../ledger/types";
import { SyncAuthError, SyncNetworkError, type FetchLike } from "../sync/engine";
import { GROUP_CURSORS_META } from "./groups";
import type { GroupRejected, GroupRows, GroupSyncResponse, WireExpense, WireGroup, WireGroupEvent, WireMember } from "./wire";

export const GROUP_PUSH_BATCH = 500;
/** Nhóm mới tối đa mỗi lô — để thành viên của nhóm mới luôn đi cùng lô với nhóm (server chỉ gắn người tạo trong lượt tạo nhóm). */
const NEW_GROUPS_PER_BATCH = 5;
export const LAST_GROUP_SYNC_META = "lastGroupSyncAt";

const strip = <T extends { _dirty?: 0 | 1 }>(row: T): Omit<T, "_dirty"> => {
  const copy = { ...row };
  delete copy._dirty;
  return copy;
};
export const toWireGroup = (g: Group): WireGroup => strip(g);
export const toWireMember = (m: GroupMember): WireMember => strip(m);
export const toWireExpense = (e: Expense): WireExpense => strip(e);
export const toWireEvent = (e: GroupEvent): WireGroupEvent => strip(e);

async function collectBatch(): Promise<GroupRows & { size: number }> {
  const d = getDb();
  const groups = await d.groups.where("_dirty").equals(1).limit(NEW_GROUPS_PER_BATCH).toArray();
  const inBatch = new Set(groups.map((g) => g.id));
  const dirtyMembers = await d.groupMembers.where("_dirty").equals(1).toArray();
  // Thành viên của nhóm trong lô đi trước.
  dirtyMembers.sort((a, b) => Number(inBatch.has(b.groupId)) - Number(inBatch.has(a.groupId)));
  let room = GROUP_PUSH_BATCH - groups.length;
  const members = dirtyMembers.slice(0, room);
  room -= members.length;
  const expenses = room > 0 ? await d.expenses.where("_dirty").equals(1).limit(room).toArray() : [];
  room -= expenses.length;
  const events = room > 0 ? await d.groupEvents.where("_dirty").equals(1).limit(room).toArray() : [];
  return {
    groups: groups.map(toWireGroup),
    members: members.map(toWireMember),
    expenses: expenses.map(toWireExpense),
    events: events.map(toWireEvent),
    size: groups.length + members.length + expenses.length + events.length,
  };
}

async function post(fetchFn: FetchLike, cursors: Record<string, number>, push: GroupRows): Promise<GroupSyncResponse> {
  let res: Response;
  try {
    res = await fetchFn("/api/groups/sync/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ cursors, push }),
    });
  } catch (err) {
    throw new SyncNetworkError(String(err));
  }
  if (res.status === 401) throw new SyncAuthError();
  if (!res.ok) throw new SyncNetworkError(`HTTP ${res.status}`);
  return (await res.json()) as GroupSyncResponse;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Ghi kết quả một request vào máy trong một transaction "ghi từ server". */
async function apply(sent: GroupRows, body: GroupSyncResponse): Promise<number> {
  const d = getDb();
  await d.transaction("rw", [d.groups, d.groupMembers, d.expenses, d.groupEvents, d.meta], async () => {
    markRemoteWrite();
    const tables = [
      [d.groups, sent.groups, body.pull.groups],
      [d.groupMembers, sent.members, body.pull.members],
      [d.expenses, sent.expenses, body.pull.expenses],
      [d.groupEvents, sent.events, body.pull.events],
    ] as const;

    for (const [table, pushed, pulled] of tables) {
      const t = table as unknown as typeof d.groups;
      // 1. Bỏ đánh dấu dòng đã gửi — chỉ khi dòng chưa bị sửa tiếp trong lúc request đang chạy.
      //    Dòng bị từ chối cũng bỏ đánh dấu: server không nhận thì gửi lại cũng vô ích, bản đúng sẽ được kéo về.
      for (const w of pushed as { id: string }[]) {
        const cur = await t.get(w.id);
        if (cur && same(strip(cur), w)) await t.update(w.id, { _dirty: 0 });
      }
      // 2. Áp dữ liệu kéo về; dòng máy còn chờ đẩy thì giữ bản máy (lượt sau server trả bản đã gộp).
      for (const w of pulled as unknown as Group[]) {
        const cur = await t.get(w.id);
        if (cur?._dirty === 1) continue;
        await t.put({ ...w, _dirty: 0 });
      }
    }

    const cursors = { ...((await getMeta<Record<string, number>>(GROUP_CURSORS_META)) ?? {}), ...body.cursors };
    // 3. Nhóm không còn quyền xem: xoá bản sao trên máy.
    for (const g of body.revoked) {
      delete cursors[g];
      await d.groups.delete(g);
      await d.groupMembers.where("groupId").equals(g).delete();
      await d.expenses.where("groupId").equals(g).delete();
      await d.groupEvents.where("groupId").equals(g).delete();
    }
    // Nhóm là thành viên nhưng máy chưa có con trỏ → lần sau kéo từ đầu (0).
    for (const g of body.groups) cursors[g] ??= 0;
    await setMeta(GROUP_CURSORS_META, cursors);
  });
  return body.pull.groups.length + body.pull.members.length + body.pull.expenses.length + body.pull.events.length;
}

export interface GroupSyncResult {
  pushed: number;
  pulled: number;
  rejected: GroupRejected[];
  /** Số nhóm tài khoản đang là thành viên — 0 thì bộ lập lịch có thể thưa lượt định kỳ. */
  groupCount: number;
}

export async function syncGroupsOnce(fetchFn: FetchLike = (i, init) => fetch(i, init)): Promise<GroupSyncResult> {
  const result: GroupSyncResult = { pushed: 0, pulled: 0, rejected: [], groupCount: 0 };
  for (let round = 0; round < 1000; round++) {
    const { size, ...push } = await collectBatch();
    const cursors = (await getMeta<Record<string, number>>(GROUP_CURSORS_META)) ?? {};
    const body = await post(fetchFn, cursors, push);
    result.pushed += size;
    result.pulled += await apply(push, body);
    result.rejected.push(...body.rejected);
    result.groupCount = body.groups.length;
    const more = size >= GROUP_PUSH_BATCH || (await getDb().groups.where("_dirty").equals(1).count()) > 0;
    if (!more && !body.hasMore) break;
  }
  await setMeta(LAST_GROUP_SYNC_META, Date.now());
  return result;
}
