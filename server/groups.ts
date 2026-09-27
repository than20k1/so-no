// API nhóm chia tiền: đồng bộ, link mời, vào / nhận vị trí / rời nhóm, xoá / khôi phục nhóm (design D6).
import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { balances } from "../lib/split/index.js";
import { GROUP_LIMITS, type GroupRows, type WireExpense } from "../lib/groups/wire.js";
import { normalizeName } from "../lib/text.js";
import { currentUser } from "./account.js";
import type { AppEnv } from "./app.js";
import type { Db } from "./db/client.js";
import * as schema from "./db/schema.js";
import { emptyRows, lockGroups, MAX_PUSH_ROWS, memberGroupIds, myMember, runGroupSync, type Tx } from "./groups-sync.js";

type Ctx = Context<AppEnv>;
const nextSeq = sql`nextval('sync_seq')`;
const JOIN_LIMIT = 30;
const JOIN_WINDOW_MS = 10 * 60 * 1000;

export type GroupError =
  | "unauthorized"
  | "invalid"
  | "not_found"
  | "forbidden"
  | "invalid_link"
  | "taken"
  | "name_taken"
  | "limit"
  | "not_settled"
  | "too_many_attempts";

const fail = (c: Ctx, error: GroupError, status: 400 | 401 | 403 | 404 | 409 | 429, extra: object = {}) =>
  c.json({ error, ...extra }, status);

async function readBody<T>(c: Ctx): Promise<Partial<T>> {
  try {
    const b = await c.req.json();
    return b && typeof b === "object" ? (b as Partial<T>) : {};
  } catch {
    return {};
  }
}

const newToken = () => randomBytes(32).toString("base64url");

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Đếm số lần thử trong cửa sổ cố định (bảng rate_limit dùng chung với Better Auth, khoá có tiền tố riêng). */
async function hit(db: Db, key: string, now: number): Promise<number> {
  const rows = (await db.execute(sql`
    insert into rate_limit (id, key, count, last_request) values (${key}, ${key}, 1, ${now})
    on conflict (key) do update set
      count = case when rate_limit.last_request < ${now - JOIN_WINDOW_MS} then 1 else rate_limit.count + 1 end,
      last_request = case when rate_limit.last_request < ${now - JOIN_WINDOW_MS} then ${now} else rate_limit.last_request end
    returning count`)) as unknown as { rows: { count: number }[] };
  return Number(rows.rows[0].count);
}

async function findInvite(db: Db | Tx, token: string) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return undefined;
  const [inv] = await db.select().from(schema.groupInvites).where(eq(schema.groupInvites.token, token));
  // So lại bằng hàm thời gian hằng — không lộ độ khớp qua thời gian phản hồi.
  return inv && sameToken(inv.token, token) ? inv : undefined;
}

async function liveGroup(q: Db | Tx, groupId: string) {
  const [g] = await q.select().from(schema.groups).where(eq(schema.groups.id, groupId));
  return g && !g.purgedAt ? g : undefined;
}

async function addEvent(
  tx: Tx,
  e: { groupId: string; entity: "group" | "member"; entityId: string; kind: string; before?: unknown; after?: unknown },
  userId: string,
  actorMemberId: string | null,
  now: number,
) {
  await tx.insert(schema.groupEvents).values({
    id: crypto.randomUUID(),
    groupId: e.groupId,
    entity: e.entity,
    entityId: e.entityId,
    kind: e.kind,
    before: e.before ?? null,
    after: e.after ?? null,
    at: now,
    userId,
    actorMemberId,
    deviceId: "server",
  });
}

/** Số dư của một thành viên, tính bằng đúng thư viện máy dùng (design D5). */
export async function memberBalance(q: Db | Tx, groupId: string, memberId: string): Promise<number> {
  const members = await q.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, groupId));
  const items = await q.select().from(schema.expenses).where(eq(schema.expenses.groupId, groupId));
  const bal = balances(
    members.map((m) => ({ id: m.id, orderKey: m.orderKey })),
    items.map((e) => ({ ...e, kind: e.kind as WireExpense["kind"], shares: e.shares as WireExpense["shares"] })),
  );
  return bal.get(memberId) ?? 0;
}

export function groupRoutes() {
  const r = new Hono<AppEnv>();

  r.post("/sync", bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: "too_large" }, 413) }), async (c) => {
    const me = await currentUser(c);
    if (!me) return fail(c, "unauthorized", 401);
    const b = await readBody<{ cursors: unknown; push: Partial<GroupRows> }>(c);
    const push = emptyRows();
    for (const k of Object.keys(push) as (keyof GroupRows)[]) {
      const rows = b.push?.[k];
      if (Array.isArray(rows)) (push[k] as unknown[]) = rows;
    }
    if (push.groups.length + push.members.length + push.expenses.length + push.events.length > MAX_PUSH_ROWS) {
      return c.json({ error: "too_many_rows" }, 413);
    }
    const cursors: Record<string, number> = {};
    if (b.cursors && typeof b.cursors === "object") {
      for (const [k, v] of Object.entries(b.cursors as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isInteger(v) && v >= 0) cursors[k] = v;
      }
    }
    return c.json(await runGroupSync(c.get("deps").db, me.userId, cursors, push));
  });

  // --- Link mời -------------------------------------------------------------

  r.post("/:id/invite", async (c) => {
    const me = await currentUser(c);
    if (!me) return fail(c, "unauthorized", 401);
    const { db } = c.get("deps");
    const groupId = c.req.param("id");
    if (!(await memberGroupIds(db, me.userId)).has(groupId)) return fail(c, "not_found", 404);
    await db
      .insert(schema.groupInvites)
      .values({ groupId, token: newToken(), createdAt: Date.now() })
      .onConflictDoNothing({ target: schema.groupInvites.groupId });
    const [inv] = await db.select().from(schema.groupInvites).where(eq(schema.groupInvites.groupId, groupId));
    return c.json({ token: inv.token });
  });

  r.post("/:id/invite/reset", async (c) => {
    const me = await currentUser(c);
    if (!me) return fail(c, "unauthorized", 401);
    const { db } = c.get("deps");
    const groupId = c.req.param("id");
    const g = await liveGroup(db, groupId);
    if (!g || !(await memberGroupIds(db, me.userId)).has(groupId)) return fail(c, "not_found", 404);
    if (g.createdByUserId !== me.userId) return fail(c, "forbidden", 403);
    const token = newToken();
    const now = Date.now();
    await db.transaction(async (tx) => {
      await lockGroups(tx, [groupId], new Set([groupId]));
      await tx
        .insert(schema.groupInvites)
        .values({ groupId, token, createdAt: now })
        .onConflictDoUpdate({ target: schema.groupInvites.groupId, set: { token, createdAt: now } });
      await addEvent(tx, { groupId, entity: "group", entityId: groupId, kind: "invite_reset" }, me.userId, (await myMember(tx, groupId, me.userId))?.id ?? null, now);
    });
    return c.json({ token });
  });

  // --- Vào nhóm -------------------------------------------------------------

  r.post("/join/preview", async (c) => {
    const me = await currentUser(c);
    if (!me) return fail(c, "unauthorized", 401);
    const { db } = c.get("deps");
    const now = Date.now();
    if ((await hit(db, `groups-join:${me.userId}`, now)) > JOIN_LIMIT) return fail(c, "too_many_attempts", 429);
    const { token } = await readBody<{ token: string }>(c);
    const inv = await findInvite(db, token as string);
    const g = inv && (await liveGroup(db, inv.groupId));
    if (!inv || !g || g.deletedAt) return fail(c, "invalid_link", 404);
    const members = await db
      .select()
      .from(schema.groupMembers)
      .where(and(eq(schema.groupMembers.groupId, g.id), isNull(schema.groupMembers.removedAt)));
    return c.json({
      groupId: g.id,
      name: g.name,
      alreadyMember: members.some((m) => m.userId === me.userId),
      members: members
        .sort((a, b) => a.orderKey - b.orderKey)
        .map((m) => ({ id: m.id, name: m.name, weight: m.weight, linked: m.userId !== null })),
    });
  });

  r.post("/join", async (c) => {
    const me = await currentUser(c);
    if (!me) return fail(c, "unauthorized", 401);
    const { db } = c.get("deps");
    const now = Date.now();
    if ((await hit(db, `groups-join:${me.userId}`, now)) > JOIN_LIMIT) return fail(c, "too_many_attempts", 429);
    const b = await readBody<{ token: string; memberId: string; name: string }>(c);
    const inv = await findInvite(db, b.token as string);
    if (!inv) return fail(c, "invalid_link", 404);
    const groupId = inv.groupId;

    type Out = { ok: true; memberId: string } | { ok: false; error: GroupError; status: 400 | 404 | 409 };
    const out: Out = await db.transaction(async (tx): Promise<Out> => {
      await lockGroups(tx, [groupId], new Set([groupId]));
      const g = await liveGroup(tx, groupId);
      if (!g || g.deletedAt) return { ok: false, error: "invalid_link", status: 404 };
      const mine = await myMember(tx, groupId, me.userId);
      if (mine) return { ok: true, memberId: mine.id };

      if (typeof b.memberId === "string") {
        const claimed = await tx
          .update(schema.groupMembers)
          .set({ userId: me.userId, updatedAt: now, seq: nextSeq })
          .where(
            and(
              eq(schema.groupMembers.id, b.memberId),
              eq(schema.groupMembers.groupId, groupId),
              isNull(schema.groupMembers.userId),
              isNull(schema.groupMembers.removedAt),
            ),
          )
          .returning({ id: schema.groupMembers.id, name: schema.groupMembers.name });
        if (claimed.length === 0) return { ok: false, error: "taken", status: 409 };
        await addEvent(tx, { groupId, entity: "member", entityId: claimed[0].id, kind: "claim", after: { name: claimed[0].name } }, me.userId, claimed[0].id, now);
        return { ok: true, memberId: claimed[0].id };
      }

      const name = typeof b.name === "string" ? b.name.replace(/\s+/g, " ").trim() : "";
      if (!name || name.length > GROUP_LIMITS.maxText) return { ok: false, error: "invalid", status: 400 };
      const active = await tx
        .select()
        .from(schema.groupMembers)
        .where(and(eq(schema.groupMembers.groupId, groupId), isNull(schema.groupMembers.removedAt)));
      if (active.length >= GROUP_LIMITS.maxMembers) return { ok: false, error: "limit", status: 409 };
      const key = normalizeName(name);
      if (active.some((m) => m.searchKey === key)) return { ok: false, error: "name_taken", status: 409 };
      const id = crypto.randomUUID();
      await tx.insert(schema.groupMembers).values({
        id,
        groupId,
        name,
        searchKey: key,
        weight: 1,
        userId: me.userId,
        orderKey: now,
        createdAt: now,
        updatedAt: now,
      });
      await addEvent(tx, { groupId, entity: "member", entityId: id, kind: "join", after: { name, weight: 1 } }, me.userId, id, now);
      return { ok: true, memberId: id };
    });
    if (!out.ok) return fail(c, out.error, out.status);
    return c.json({ groupId, memberId: out.memberId });
  });

  // --- Rời, xoá, khôi phục --------------------------------------------------

  r.post("/:id/leave", async (c) => {
    const me = await currentUser(c);
    if (!me) return fail(c, "unauthorized", 401);
    const { db } = c.get("deps");
    const groupId = c.req.param("id");
    const now = Date.now();
    const out = await db.transaction(async (tx) => {
      await lockGroups(tx, [groupId], new Set([groupId]));
      const mine = await myMember(tx, groupId, me.userId);
      if (!mine) return { error: "not_found" as const };
      const balance = await memberBalance(tx, groupId, mine.id);
      if (balance !== 0) return { error: "not_settled" as const, balance };
      await tx
        .update(schema.groupMembers)
        .set({ userId: null, updatedAt: now, seq: nextSeq })
        .where(eq(schema.groupMembers.id, mine.id));
      await addEvent(tx, { groupId, entity: "member", entityId: mine.id, kind: "leave", before: { name: mine.name } }, me.userId, mine.id, now);
      return { error: null };
    });
    if (out.error === "not_found") return fail(c, "not_found", 404);
    if (out.error === "not_settled") return fail(c, "not_settled", 409, { balance: out.balance });
    return c.json({ ok: true });
  });

  for (const action of ["delete", "restore"] as const) {
    r.post(`/:id/${action}`, async (c) => {
      const me = await currentUser(c);
      if (!me) return fail(c, "unauthorized", 401);
      const { db } = c.get("deps");
      const groupId = c.req.param("id");
      const now = Date.now();
      const out = await db.transaction(async (tx) => {
        await lockGroups(tx, [groupId], new Set([groupId]));
        const g = await liveGroup(tx, groupId);
        const mine = await myMember(tx, groupId, me.userId);
        if (!g || !mine) return "not_found" as const;
        if (g.createdByUserId !== me.userId) return "forbidden" as const;
        if ((action === "delete") === Boolean(g.deletedAt)) return "ok" as const;
        await tx
          .update(schema.groups)
          .set(action === "delete" ? { deletedAt: now, serverDeletedAt: now, updatedAt: now, seq: nextSeq } : { deletedAt: null, serverDeletedAt: null, updatedAt: now, seq: nextSeq })
          .where(eq(schema.groups.id, groupId));
        await addEvent(tx, { groupId, entity: "group", entityId: groupId, kind: action }, me.userId, mine.id, now);
        return "ok" as const;
      });
      if (out === "not_found") return fail(c, "not_found", 404);
      if (out === "forbidden") return fail(c, "forbidden", 403);
      return c.json({ ok: true });
    });
  }

  return r;
}
