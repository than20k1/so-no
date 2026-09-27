// POST /api/groups/sync — đồng bộ nhóm chia tiền giữa các thành viên (design D1–D4, D10).
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import {
  GROUP_LIMITS,
  type GroupRejected,
  type GroupRows,
  type GroupSyncResponse,
  type WireExpense,
  type WireGroup,
  type WireGroupEvent,
  type WireMember,
} from "../lib/groups/wire.js";
import { normalizeName } from "../lib/text.js";
import type { Db } from "./db/client.js";
import * as schema from "./db/schema.js";

export const MAX_PUSH_ROWS = 500;
export const PULL_LIMIT = 1000;
const nextSeq = sql`nextval('sync_seq')`;

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Q = Db | Tx;

// ---------------------------------------------------------------------------
// Kiểm tra dữ liệu vào
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.length <= GROUP_LIMITS.maxText;
const isName = (v: unknown): v is string => isText(v) && v.trim() !== "";
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isTimeOrNull = (v: unknown) => v === null || v === undefined || isTime(v);
const isAmount = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v > 0 && v <= GROUP_LIMITS.maxAmount;
const isWeight = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= GROUP_LIMITS.maxWeight;
const ENTITIES = ["group", "member", "expense"];
const KINDS = ["create", "edit", "delete", "restore", "join", "claim", "leave", "remove", "invite_reset"];

export const validGroup = (g: WireGroup) => isId(g?.id) && isName(g.name) && isTime(g.createdAt) && isTime(g.updatedAt);

export const validMember = (m: WireMember) =>
  isId(m?.id) && isId(m.groupId) && isName(m.name) && isText(m.searchKey) && isWeight(m.weight) && isTime(m.orderKey) &&
  isTime(m.createdAt) && isTime(m.updatedAt) && isTimeOrNull(m.removedAt);

export function validExpense(e: WireExpense): boolean {
  if (!isId(e?.id) || !isId(e.groupId) || !isAmount(e.amount) || !isId(e.payerMemberId) || !isText(e.title ?? "")) return false;
  if (!isTime(e.occurredAt) || !isTime(e.createdAt) || !isTime(e.updatedAt) || !isTimeOrNull(e.deletedAt)) return false;
  if (e.kind === "settlement") return isId(e.toMemberId) && e.toMemberId !== e.payerMemberId;
  if (e.kind !== "expense" || !isName(e.title)) return false;
  if (!Array.isArray(e.shares) || e.shares.length === 0 || e.shares.length > GROUP_LIMITS.maxMembers) return false;
  const ids = new Set<string>();
  for (const s of e.shares) {
    if (!isId(s?.memberId) || !isWeight(s.weight) || ids.has(s.memberId)) return false;
    ids.add(s.memberId);
  }
  return true;
}

export const validEvent = (e: WireGroupEvent) =>
  isId(e?.id) && isId(e.groupId) && isId(e.entityId) && ENTITIES.includes(e.entity) && KINDS.includes(e.kind) &&
  isTime(e.at) && isText(e.deviceId ?? "") && JSON.stringify(e.before ?? null).length <= 4000 &&
  JSON.stringify(e.after ?? null).length <= 4000;

/** Id các thành viên được nhắc tới trong một món / dòng thanh toán. */
export function memberRefs(e: Pick<WireExpense, "payerMemberId" | "toMemberId" | "shares">): string[] {
  return [e.payerMemberId, ...(e.toMemberId ? [e.toMemberId] : []), ...(e.shares ?? []).map((s) => s.memberId)];
}

// ---------------------------------------------------------------------------
// Quyền và khoá
// ---------------------------------------------------------------------------

/** Các nhóm tài khoản đang là thành viên, bỏ nhóm đã ẩn hẳn (spec "Quyền truy cập nhóm"). */
export async function memberGroupIds(q: Q, userId: string): Promise<Set<string>> {
  const rows = await q
    .select({ id: schema.groupMembers.groupId })
    .from(schema.groupMembers)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.groupMembers.groupId))
    .where(and(eq(schema.groupMembers.userId, userId), isNull(schema.groups.purgedAt)));
  return new Set(rows.map((r) => r.id));
}

/** Thành viên của tài khoản trong nhóm (hoặc undefined). */
export async function myMember(q: Q, groupId: string, userId: string) {
  const [m] = await q
    .select()
    .from(schema.groupMembers)
    .where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, userId)));
  return m;
}

/**
 * Khoá dòng nhóm theo thứ tự id (tránh deadlock): nhóm có ghi → FOR UPDATE, nhóm chỉ đọc → FOR SHARE.
 * Người ghi cùng nhóm chạy lần lượt; người đọc chờ người ghi commit → con trỏ kéo không bỏ sót seq (design D3).
 */
export async function lockGroups(tx: Tx, ids: Iterable<string>, write: Set<string>) {
  for (const id of [...new Set(ids)].sort()) {
    const q = tx.select({ id: schema.groups.id }).from(schema.groups).where(eq(schema.groups.id, id));
    if (write.has(id)) await q.for("update");
    else await q.for("share");
  }
}

/** Thành viên đã dính vào món hay dòng thanh toán nào (kể cả đã xoá) thì không xoá được. */
export async function memberInUse(q: Q, groupId: string, memberId: string): Promise<boolean> {
  const rows = await q
    .select({ id: schema.expenses.id })
    .from(schema.expenses)
    .where(
      and(
        eq(schema.expenses.groupId, groupId),
        sql`(${schema.expenses.payerMemberId} = ${memberId} or ${schema.expenses.toMemberId} = ${memberId}
          or ${schema.expenses.shares} @> jsonb_build_array(jsonb_build_object('memberId', ${memberId}::text)))`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Đẩy
// ---------------------------------------------------------------------------

interface PushCtx {
  tx: Tx;
  userId: string;
  now: number;
  /** Nhóm được phép ghi: đang là thành viên, hoặc vừa tạo trong lượt này. */
  allowed: Set<string>;
  created: Set<string>;
  rejected: GroupRejected[];
}

async function pushGroups(ctx: PushCtx, rows: WireGroup[], existing: Map<string, typeof schema.groups.$inferSelect>) {
  for (const g of rows) {
    const cur = existing.get(g.id);
    if (!cur) {
      await ctx.tx.insert(schema.groups).values({
        id: g.id,
        name: g.name.trim(),
        createdByUserId: ctx.userId,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      });
      ctx.created.add(g.id);
      ctx.allowed.add(g.id);
      continue;
    }
    if (!ctx.allowed.has(g.id)) {
      ctx.rejected.push({ table: "groups", id: g.id, reason: "forbidden" });
      continue;
    }
    // Đổi tên: bản tới sau thắng. Xoá/khôi phục chỉ qua endpoint riêng — bỏ qua deletedAt máy gửi.
    if (cur.name !== g.name.trim()) {
      await ctx.tx
        .update(schema.groups)
        .set({ name: g.name.trim(), updatedAt: g.updatedAt, seq: nextSeq })
        .where(eq(schema.groups.id, g.id));
    }
  }
}

async function pushMembers(ctx: PushCtx, rows: WireMember[]) {
  if (rows.length === 0) return;
  const existing = new Map(
    (await ctx.tx.select().from(schema.groupMembers).where(inArray(schema.groupMembers.id, rows.map((r) => r.id)))).map((r) => [r.id, r]),
  );
  for (const m of rows) {
    const cur = existing.get(m.id);
    if (!ctx.allowed.has(m.groupId) || (cur && cur.groupId !== m.groupId)) {
      ctx.rejected.push({ table: "members", id: m.id, reason: "forbidden" });
      continue;
    }
    if (!cur) {
      const [{ count }] = await ctx.tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.groupMembers)
        .where(and(eq(schema.groupMembers.groupId, m.groupId), isNull(schema.groupMembers.removedAt)));
      if (count >= GROUP_LIMITS.maxMembers) {
        ctx.rejected.push({ table: "members", id: m.id, reason: "limit" });
        continue;
      }
      // Máy chỉ tự gắn tài khoản cho chính mình, và chỉ khi vừa tạo nhóm (design D4).
      const self =
        m.userId === ctx.userId && ctx.created.has(m.groupId) && !(await myMember(ctx.tx, m.groupId, ctx.userId));
      await ctx.tx.insert(schema.groupMembers).values({
        id: m.id,
        groupId: m.groupId,
        name: m.name.trim(),
        searchKey: normalizeName(m.name),
        weight: m.weight,
        userId: self ? ctx.userId : null,
        orderKey: m.orderKey,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        removedAt: self ? null : (m.removedAt ?? null),
      });
      continue;
    }

    let removedAt = cur.removedAt;
    let refused = false;
    if (m.removedAt && !cur.removedAt) {
      if (cur.userId !== null || (await memberInUse(ctx.tx, cur.groupId, cur.id))) {
        ctx.rejected.push({ table: "members", id: m.id, reason: "member_in_use" });
        refused = true;
      } else removedAt = m.removedAt;
    } else if (!m.removedAt && cur.removedAt) removedAt = null;

    const changed = cur.name !== m.name.trim() || cur.weight !== m.weight || cur.removedAt !== removedAt;
    // Bị từ chối vẫn cấp seq mới để máy kéo về trạng thái đúng.
    if (changed || refused) {
      await ctx.tx
        .update(schema.groupMembers)
        .set({ name: m.name.trim(), searchKey: normalizeName(m.name), weight: m.weight, removedAt, updatedAt: m.updatedAt, seq: nextSeq })
        .where(eq(schema.groupMembers.id, m.id));
    }
  }
}

async function pushExpenses(ctx: PushCtx, rows: WireExpense[]) {
  if (rows.length === 0) return;
  const existing = new Map(
    (await ctx.tx.select().from(schema.expenses).where(inArray(schema.expenses.id, rows.map((r) => r.id)))).map((r) => [r.id, r]),
  );
  const groupIds = [...new Set(rows.map((r) => r.groupId))];
  const memberRows = await ctx.tx
    .select({ id: schema.groupMembers.id, groupId: schema.groupMembers.groupId })
    .from(schema.groupMembers)
    .where(inArray(schema.groupMembers.groupId, groupIds));
  const memberGroup = new Map(memberRows.map((r) => [r.id, r.groupId]));

  for (const e of rows) {
    const cur = existing.get(e.id);
    if (!ctx.allowed.has(e.groupId) || (cur && cur.groupId !== e.groupId)) {
      ctx.rejected.push({ table: "expenses", id: e.id, reason: "forbidden" });
      continue;
    }
    if (memberRefs(e).some((id) => memberGroup.get(id) !== e.groupId)) {
      ctx.rejected.push({ table: "expenses", id: e.id, reason: "invalid" });
      continue;
    }
    const values = {
      kind: e.kind,
      title: e.title.trim(),
      amount: e.amount,
      payerMemberId: e.payerMemberId,
      toMemberId: e.kind === "settlement" ? e.toMemberId : null,
      shares: e.kind === "expense" ? e.shares : null,
      occurredAt: e.occurredAt,
      updatedAt: e.updatedAt,
      deletedAt: e.deletedAt ?? null,
      updatedByUserId: ctx.userId,
    };
    if (!cur) {
      await ctx.tx.insert(schema.expenses).values({ id: e.id, groupId: e.groupId, createdAt: e.createdAt, ...values });
      continue;
    }
    const same =
      cur.kind === values.kind && cur.title === values.title && cur.amount === values.amount &&
      cur.payerMemberId === values.payerMemberId && cur.toMemberId === values.toMemberId &&
      JSON.stringify(cur.shares) === JSON.stringify(values.shares) && cur.occurredAt === values.occurredAt &&
      cur.deletedAt === values.deletedAt;
    // Cả dòng: bản tới server sau cùng thắng (design D4).
    if (!same) await ctx.tx.update(schema.expenses).set({ ...values, seq: nextSeq }).where(eq(schema.expenses.id, e.id));
  }
}

async function pushEvents(ctx: PushCtx, rows: WireGroupEvent[]) {
  const actors = new Map<string, string | null>();
  const values = [];
  for (const e of rows) {
    if (!ctx.allowed.has(e.groupId)) {
      ctx.rejected.push({ table: "events", id: e.id, reason: "forbidden" });
      continue;
    }
    if (!actors.has(e.groupId)) actors.set(e.groupId, (await myMember(ctx.tx, e.groupId, ctx.userId))?.id ?? null);
    values.push({
      id: e.id,
      groupId: e.groupId,
      entity: e.entity,
      entityId: e.entityId,
      kind: e.kind,
      before: e.before ?? null,
      after: e.after ?? null,
      at: e.at,
      userId: ctx.userId,
      actorMemberId: actors.get(e.groupId) ?? null,
      deviceId: e.deviceId ?? "",
    });
  }
  if (values.length) await ctx.tx.insert(schema.groupEvents).values(values).onConflictDoNothing({ target: schema.groupEvents.id });
}

/** Nhóm đã nằm thùng rác đủ 30 ngày theo giờ server → ẩn hẳn (vẫn giữ trong DB). */
async function autoPurge(tx: Tx, ids: string[], now: number) {
  if (ids.length === 0) return;
  await tx
    .update(schema.groups)
    .set({ purgedAt: now, seq: nextSeq })
    .where(
      and(
        inArray(schema.groups.id, ids),
        isNull(schema.groups.purgedAt),
        isNotNull(schema.groups.deletedAt),
        lte(schema.groups.serverDeletedAt, now - GROUP_LIMITS.autoPurgeMs),
      ),
    );
}

// ---------------------------------------------------------------------------
// Kéo
// ---------------------------------------------------------------------------

type Item =
  | { seq: number; groupId: string; table: "groups"; row: WireGroup }
  | { seq: number; groupId: string; table: "members"; row: WireMember }
  | { seq: number; groupId: string; table: "expenses"; row: WireExpense }
  | { seq: number; groupId: string; table: "events"; row: WireGroupEvent };

async function pullGroup(tx: Tx, groupId: string, cursor: number): Promise<Item[]> {
  const lim = PULL_LIMIT + 1;
  const [groups, members, expenses, events] = await Promise.all([
    tx.select().from(schema.groups).where(and(eq(schema.groups.id, groupId), gt(schema.groups.seq, cursor))),
    tx.select().from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, groupId), gt(schema.groupMembers.seq, cursor))).orderBy(asc(schema.groupMembers.seq)).limit(lim),
    tx.select().from(schema.expenses).where(and(eq(schema.expenses.groupId, groupId), gt(schema.expenses.seq, cursor))).orderBy(asc(schema.expenses.seq)).limit(lim),
    tx.select().from(schema.groupEvents).where(and(eq(schema.groupEvents.groupId, groupId), gt(schema.groupEvents.seq, cursor))).orderBy(asc(schema.groupEvents.seq)).limit(lim),
  ]);
  return [
    ...groups.map((g): Item => ({
      seq: g.seq,
      groupId,
      table: "groups",
      row: { id: g.id, name: g.name, createdByUserId: g.createdByUserId, createdAt: g.createdAt, updatedAt: g.updatedAt, deletedAt: g.deletedAt },
    })),
    ...members.map(({ seq, ...m }): Item => ({ seq, groupId, table: "members", row: m })),
    ...expenses.map(({ seq, ...e }): Item => {
      // Người sửa cuối chỉ server dùng — không gửi xuống máy.
      const row: Partial<typeof e> = { ...e };
      delete row.updatedByUserId;
      return { seq, groupId, table: "expenses", row: row as WireExpense };
    }),
    ...events.map(({ seq, ...e }): Item => ({ seq, groupId, table: "events", row: e as WireGroupEvent })),
  ];
}

// ---------------------------------------------------------------------------
// Một lượt đồng bộ
// ---------------------------------------------------------------------------

export const emptyRows = (): GroupRows => ({ groups: [], members: [], expenses: [], events: [] });

export async function runGroupSync(
  db: Db,
  userId: string,
  cursors: Record<string, number>,
  push: GroupRows,
  now = Date.now(),
): Promise<GroupSyncResponse> {
  const rejected: GroupRejected[] = [];
  const keep = <T extends { id: string }>(table: keyof GroupRows, rows: T[], ok: (r: T) => boolean) =>
    rows.filter((r) => ok(r) || !rejected.push({ table, id: String(r?.id), reason: "invalid" }));
  const valid: GroupRows = {
    groups: keep("groups", push.groups, validGroup),
    members: keep("members", push.members, validMember),
    expenses: keep("expenses", push.expenses, validExpense),
    events: keep("events", push.events, validEvent),
  };

  return db.transaction(async (tx) => {
    const mine = await memberGroupIds(tx, userId);
    const pushedGroupIds = new Set([
      ...valid.groups.map((g) => g.id),
      ...valid.members.map((m) => m.groupId),
      ...valid.expenses.map((e) => e.groupId),
      ...valid.events.map((e) => e.groupId),
    ]);
    const existingGroups = new Map(
      pushedGroupIds.size === 0
        ? []
        : (await tx.select().from(schema.groups).where(inArray(schema.groups.id, [...pushedGroupIds]))).map((g) => [g.id, g]),
    );
    const purgeCandidates = (
      mine.size === 0
        ? []
        : await tx
            .select({ id: schema.groups.id })
            .from(schema.groups)
            .where(
              and(
                inArray(schema.groups.id, [...mine]),
                isNull(schema.groups.purgedAt),
                lte(schema.groups.serverDeletedAt, now - GROUP_LIMITS.autoPurgeMs),
              ),
            )
    ).map((r) => r.id);

    const write = new Set([...[...pushedGroupIds].filter((id) => mine.has(id)), ...purgeCandidates]);
    await lockGroups(tx, [...mine, ...write], write);

    const ctx: PushCtx = { tx, userId, now, allowed: new Set(mine), created: new Set(), rejected };
    await pushGroups(ctx, valid.groups, existingGroups);
    await pushMembers(ctx, valid.members);
    await pushExpenses(ctx, valid.expenses);
    await pushEvents(ctx, valid.events);
    await autoPurge(tx, purgeCandidates, now);

    const member = await memberGroupIds(tx, userId);
    const items: Item[] = [];
    for (const g of member) items.push(...(await pullGroup(tx, g, cursors[g] ?? 0)));
    items.sort((a, b) => a.seq - b.seq);
    const page = items.slice(0, PULL_LIMIT);

    const pull = emptyRows();
    const nextCursors: Record<string, number> = {};
    for (const it of page) {
      (pull[it.table] as unknown[]).push(it.row);
      nextCursors[it.groupId] = it.seq;
    }
    return {
      cursors: nextCursors,
      groups: [...member],
      revoked: Object.keys(cursors).filter((g) => !member.has(g)),
      pull,
      hasMore: items.length > PULL_LIMIT,
      rejected,
      serverNow: now,
    };
  });
}
