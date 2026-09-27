"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getDb, getMeta } from "../ledger/db";
import { viewGroup, type GroupData, type GroupView } from "./view";

const ACCOUNT_META = "accountUserId";

/** Tài khoản đang gắn với máy; `null` = chưa đăng nhập; `undefined` = đang tải. */
export function useMyUserId(): string | null | undefined {
  return useLiveQuery(async () => (await getMeta<string>(ACCOUNT_META)) ?? null, []);
}

async function loadAll(): Promise<{ userId: string | null; data: GroupData[] }> {
  const d = getDb();
  const [userId, groups, members, items, events] = await Promise.all([
    getMeta<string>(ACCOUNT_META),
    d.groups.toArray(),
    d.groupMembers.toArray(),
    d.expenses.toArray(),
    d.groupEvents.toArray(),
  ]);
  const by = <T extends { groupId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.groupId, [...(m.get(r.groupId) ?? []), r]);
    return m;
  };
  const [bm, bi, be] = [by(members), by(items), by(events)];
  return {
    userId: userId ?? null,
    data: groups.map((group) => ({ group, members: bm.get(group.id) ?? [], items: bi.get(group.id) ?? [], events: be.get(group.id) ?? [] })),
  };
}

/** Mọi nhóm trên máy, đã tính số dư; sắp theo thay đổi gần nhất. `undefined` khi đang tải. */
export function useGroupList(): GroupView[] | undefined {
  return useLiveQuery(async () => {
    const { userId, data } = await loadAll();
    return data.map((g) => viewGroup(g, userId)).sort((a, b) => b.lastActivity - a.lastActivity);
  }, []);
}

/** Một nhóm; `null` = không có trên máy; `undefined` = đang tải. */
export function useGroup(id: string | null): GroupView | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    const d = getDb();
    const group = await d.groups.get(id);
    if (!group) return null;
    const [members, items, events, userId] = await Promise.all([
      d.groupMembers.where("groupId").equals(id).toArray(),
      d.expenses.where("groupId").equals(id).toArray(),
      d.groupEvents.where("groupId").equals(id).toArray(),
      getMeta<string>(ACCOUNT_META),
    ]);
    return viewGroup({ group, members, items, events }, userId);
  }, [id]);
}
