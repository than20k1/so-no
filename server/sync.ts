// POST /api/sync — một request vừa đẩy vừa kéo (design D7).
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { currentUser } from "./account";
import type { AppEnv } from "./app";
import type { Db } from "./db/client";
import * as schema from "./db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;
export const PURGE_ALLOWED_MS = 15 * DAY_MS;
export const AUTO_PURGE_MS = 30 * DAY_MS;
export const MAX_PUSH_ROWS = 500;
export const PULL_LIMIT = 1000;
const MAX_AMOUNT = 1_000_000_000;
const MAX_TEXT = 200;
const nextSeq = sql`nextval('sync_seq')`;

// Dạng dữ liệu trao đổi — giống hệt lib/ledger/types.ts phía trình duyệt.
export interface SyncDebtor {
  id: string;
  bookId: string;
  name: string;
  note: string;
  searchKey: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  purgedAt: number | null;
}
export interface SyncTransaction {
  id: string;
  bookId: string;
  debtorId: string;
  amount: number;
  kind: "add" | "pay";
  direction: "they_owe" | "i_owe";
  occurredAt: number | null;
  createdAt: number;
  updatedAt: number;
  voidedAt: number | null;
  source: "manual" | "backup" | "scan";
  note: string;
  deviceId: string;
}
export interface SyncEvent {
  id: string;
  bookId: string;
  debtorId: string;
  kind: "edit" | "delete" | "restore" | "purge";
  before: { name: string; note: string } | null;
  after: { name: string; note: string } | null;
  at: number;
  deviceId: string;
}
export interface SyncRows {
  debtors: SyncDebtor[];
  transactions: SyncTransaction[];
  debtorEvents: SyncEvent[];
}
export type RejectReason = "invalid" | "foreign" | "orphan" | "purge_too_early";
export interface Rejected {
  table: keyof SyncRows;
  id: string;
  reason: RejectReason;
}
export interface SyncResponse {
  cursor: number;
  pull: SyncRows;
  hasMore: boolean;
  rejected: Rejected[];
  serverNow: number;
}

// ---------------------------------------------------------------------------
// Kiểm tra dữ liệu vào
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_TEXT;
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isTimeOrNull = (v: unknown) => v === null || v === undefined || isTime(v);
const isFields = (v: unknown) =>
  v === null || v === undefined || (typeof v === "object" && isText((v as { name: unknown }).name) && isText((v as { note: unknown }).note));

const validDebtor = (d: SyncDebtor) =>
  isId(d.id) && isText(d.name) && d.name.trim() !== "" && isText(d.note ?? "") && isText(d.searchKey) &&
  isTime(d.createdAt) && isTime(d.updatedAt) && isTimeOrNull(d.deletedAt) && isTimeOrNull(d.purgedAt);
const validTx = (t: SyncTransaction) =>
  isId(t.id) && isId(t.debtorId) && Number.isInteger(t.amount) && t.amount > 0 && t.amount <= MAX_AMOUNT &&
  (t.kind === "add" || t.kind === "pay") && (t.direction === "they_owe" || t.direction === "i_owe") &&
  ["manual", "backup", "scan"].includes(t.source) && isTimeOrNull(t.occurredAt) && isTime(t.createdAt) &&
  isTime(t.updatedAt) && isTimeOrNull(t.voidedAt) && isText(t.note ?? "") && isText(t.deviceId ?? "");
const validEvent = (e: SyncEvent) =>
  isId(e.id) && isId(e.debtorId) && ["edit", "delete", "restore", "purge"].includes(e.kind) && isTime(e.at) &&
  isFields(e.before) && isFields(e.after) && isText(e.deviceId ?? "");

// ---------------------------------------------------------------------------
// Đẩy
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Id đã tồn tại nhưng thuộc sổ khác → từ chối (không bao giờ ghi đè sang sổ người khác). */
async function foreignIds(tx: Tx, table: typeof schema.debtors | typeof schema.transactions | typeof schema.debtorEvents, ids: string[], bookId: string) {
  if (ids.length === 0) return new Set<string>();
  const rows = await tx.select({ id: table.id }).from(table).where(and(inArray(table.id, ids), ne(table.bookId, bookId)));
  return new Set(rows.map((r) => r.id));
}

async function pushDebtors(tx: Tx, bookId: string, rows: SyncDebtor[], now: number, rejected: Rejected[]) {
  const foreign = await foreignIds(tx, schema.debtors, rows.map((r) => r.id), bookId);
  const existing = new Map(
    rows.length === 0
      ? []
      : (
          await tx.select().from(schema.debtors).where(inArray(schema.debtors.id, rows.map((r) => r.id)))
        ).map((r) => [r.id, r]),
  );

  for (const d of rows) {
    if (foreign.has(d.id)) {
      rejected.push({ table: "debtors", id: d.id, reason: "foreign" });
      continue;
    }
    const cur = existing.get(d.id);
    if (!cur) {
      // Dòng mới lên server (vd. sổ làm lúc chưa đăng nhập): nhận nguyên trạng, kể cả đã xoá/xoá hẳn trên máy.
      await tx.insert(schema.debtors).values({
        id: d.id,
        bookId,
        name: d.name,
        note: d.note ?? "",
        searchKey: d.searchKey,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        deletedAt: d.deletedAt ?? null,
        purgedAt: d.deletedAt ? (d.purgedAt ?? null) : null,
        serverDeletedAt: d.deletedAt ? Math.min(d.deletedAt, now) : null,
      });
      continue;
    }
    // Đã xoá hẳn trên server: chỉ admin mới đổi được.
    if (cur.purgedAt) continue;

    const next = { ...cur, name: d.name, note: d.note ?? "", searchKey: d.searchKey, updatedAt: d.updatedAt };
    if (d.deletedAt && !cur.deletedAt) {
      next.deletedAt = d.deletedAt;
      next.serverDeletedAt = now;
    } else if (!d.deletedAt && cur.deletedAt) {
      next.deletedAt = null;
      next.serverDeletedAt = null;
    }
    if (d.purgedAt && next.deletedAt) {
      if (next.serverDeletedAt !== null && now - next.serverDeletedAt >= PURGE_ALLOWED_MS) next.purgedAt = now;
      else rejected.push({ table: "debtors", id: d.id, reason: "purge_too_early" });
    }

    const changed =
      next.name !== cur.name || next.note !== cur.note || next.deletedAt !== cur.deletedAt || next.purgedAt !== cur.purgedAt;
    // Dòng bị từ chối xoá hẳn luôn được cấp seq mới để máy nhận lại trạng thái đúng của server.
    const forceResend = rejected.some((r) => r.id === d.id && r.table === "debtors");
    if (changed || forceResend) {
      await tx
        .update(schema.debtors)
        .set({
          name: next.name,
          note: next.note,
          searchKey: next.searchKey,
          updatedAt: next.updatedAt,
          deletedAt: next.deletedAt,
          purgedAt: next.purgedAt,
          serverDeletedAt: next.serverDeletedAt,
          seq: nextSeq,
        })
        .where(eq(schema.debtors.id, d.id));
    }
  }
}

async function pushTransactions(tx: Tx, bookId: string, rows: SyncTransaction[], rejected: Rejected[]) {
  if (rows.length === 0) return;
  const foreign = await foreignIds(tx, schema.transactions, rows.map((r) => r.id), bookId);
  const debtorIds = [...new Set(rows.map((r) => r.debtorId))];
  const known = new Set(
    (
      await tx
        .select({ id: schema.debtors.id })
        .from(schema.debtors)
        .where(and(inArray(schema.debtors.id, debtorIds), eq(schema.debtors.bookId, bookId)))
    ).map((r) => r.id),
  );
  const existing = new Map(
    (await tx.select().from(schema.transactions).where(inArray(schema.transactions.id, rows.map((r) => r.id)))).map((r) => [r.id, r]),
  );

  for (const t of rows) {
    if (foreign.has(t.id)) {
      rejected.push({ table: "transactions", id: t.id, reason: "foreign" });
      continue;
    }
    const cur = existing.get(t.id);
    if (!cur) {
      if (!known.has(t.debtorId)) {
        rejected.push({ table: "transactions", id: t.id, reason: "orphan" });
        continue;
      }
      await tx.insert(schema.transactions).values({
        id: t.id,
        bookId,
        debtorId: t.debtorId,
        amount: t.amount,
        kind: t.kind,
        direction: t.direction,
        occurredAt: t.occurredAt ?? null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        voidedAt: t.voidedAt ?? null,
        source: t.source,
        note: t.note ?? "",
        deviceId: t.deviceId ?? "",
      });
    } else if (cur.voidedAt === null && t.voidedAt) {
      // Chỉ một thứ đổi được trên giao dịch: từ chưa hủy sang đã hủy (không bao giờ ngược lại).
      await tx
        .update(schema.transactions)
        .set({ voidedAt: t.voidedAt, updatedAt: t.updatedAt, seq: nextSeq })
        .where(eq(schema.transactions.id, t.id));
    }
  }
}

async function pushEvents(tx: Tx, bookId: string, rows: SyncEvent[], rejected: Rejected[]) {
  if (rows.length === 0) return;
  const foreign = await foreignIds(tx, schema.debtorEvents, rows.map((r) => r.id), bookId);
  const fresh = rows.filter((e) => {
    if (!foreign.has(e.id)) return true;
    rejected.push({ table: "debtorEvents", id: e.id, reason: "foreign" });
    return false;
  });
  if (fresh.length === 0) return;
  await tx
    .insert(schema.debtorEvents)
    .values(
      fresh.map((e) => ({
        id: e.id,
        bookId,
        debtorId: e.debtorId,
        kind: e.kind,
        before: e.before ?? null,
        after: e.after ?? null,
        at: e.at,
        deviceId: e.deviceId ?? "",
      })),
    )
    .onConflictDoNothing({ target: schema.debtorEvents.id });
}

/** Tự xoá hẳn người đã nằm thùng rác đủ 30 ngày theo giờ server. */
export async function autoPurge(tx: Tx, bookId: string, now: number) {
  await tx
    .update(schema.debtors)
    .set({ purgedAt: now, seq: nextSeq })
    .where(
      and(
        eq(schema.debtors.bookId, bookId),
        isNull(schema.debtors.purgedAt),
        isNotNull(schema.debtors.deletedAt),
        lte(schema.debtors.serverDeletedAt, now - AUTO_PURGE_MS),
      ),
    );
}

// ---------------------------------------------------------------------------
// Kéo
// ---------------------------------------------------------------------------

async function pull(tx: Tx, bookId: string, cursor: number) {
  const [debtors, transactions, events] = await Promise.all([
    tx.select().from(schema.debtors).where(and(eq(schema.debtors.bookId, bookId), gt(schema.debtors.seq, cursor))).orderBy(asc(schema.debtors.seq)).limit(PULL_LIMIT + 1),
    tx.select().from(schema.transactions).where(and(eq(schema.transactions.bookId, bookId), gt(schema.transactions.seq, cursor))).orderBy(asc(schema.transactions.seq)).limit(PULL_LIMIT + 1),
    tx.select().from(schema.debtorEvents).where(and(eq(schema.debtorEvents.bookId, bookId), gt(schema.debtorEvents.seq, cursor))).orderBy(asc(schema.debtorEvents.seq)).limit(PULL_LIMIT + 1),
  ]);
  // Gộp ba bảng theo seq chung rồi cắt đúng PULL_LIMIT dòng — con trỏ luôn liền mạch.
  const merged = [
    ...debtors.map((row) => ({ seq: row.seq, table: "debtors" as const, row })),
    ...transactions.map((row) => ({ seq: row.seq, table: "transactions" as const, row })),
    ...events.map((row) => ({ seq: row.seq, table: "debtorEvents" as const, row })),
  ].sort((a, b) => a.seq - b.seq);
  const page = merged.slice(0, PULL_LIMIT);
  const out: SyncRows = { debtors: [], transactions: [], debtorEvents: [] };
  // Bỏ các cột chỉ server dùng (seq, server_deleted_at) trước khi gửi xuống máy.
  const strip = <T extends { seq: number }>(row: T, ...extra: (keyof T)[]) => {
    const copy: Partial<T> = { ...row };
    delete copy.seq;
    for (const k of extra) delete copy[k];
    return copy;
  };
  for (const item of page) {
    if (item.table === "debtors") out.debtors.push(strip(item.row, "serverDeletedAt") as SyncDebtor);
    else if (item.table === "transactions") out.transactions.push(strip(item.row) as SyncTransaction);
    else out.debtorEvents.push(strip(item.row) as SyncEvent);
  }
  return {
    pull: out,
    cursor: page.length ? page[page.length - 1].seq : cursor,
    hasMore: merged.length > PULL_LIMIT,
  };
}

/** Một lượt đồng bộ trọn vẹn trong một transaction, đã khoá sổ (xem chú thích bên trong). */
export async function runSync(db: Db, bookId: string, cursor: number, push: SyncRows, now = Date.now()): Promise<SyncResponse> {
  const rejected: Rejected[] = [];
  const valid = {
    debtors: push.debtors.filter((d) => validDebtor(d) || !rejected.push({ table: "debtors", id: String(d?.id), reason: "invalid" })),
    transactions: push.transactions.filter((t) => validTx(t) || !rejected.push({ table: "transactions", id: String(t?.id), reason: "invalid" })),
    debtorEvents: push.debtorEvents.filter((e) => validEvent(e) || !rejected.push({ table: "debtorEvents", id: String(e?.id), reason: "invalid" })),
  };

  return db.transaction(async (tx) => {
    // Khoá dòng sổ: mọi lượt đồng bộ của cùng một sổ chạy lần lượt, nên seq được cấp và commit theo đúng thứ tự
    // — lượt kéo không bao giờ bỏ sót dòng có seq nhỏ hơn con trỏ mà commit muộn.
    await tx.select({ id: schema.books.id }).from(schema.books).where(eq(schema.books.id, bookId)).for("update");
    await pushDebtors(tx, bookId, valid.debtors, now, rejected);
    await pushTransactions(tx, bookId, valid.transactions, rejected);
    await pushEvents(tx, bookId, valid.debtorEvents, rejected);
    await autoPurge(tx, bookId, now);
    const pulled = await pull(tx, bookId, cursor);
    return { ...pulled, rejected, serverNow: now };
  });
}

export function syncRoutes() {
  const r = new Hono<AppEnv>();
  r.post("/", bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: "too_large" }, 413) }), async (c) => {
    const me = await currentUser(c);
    if (!me) return c.json({ error: "unauthorized" }, 401);
    let b: { cursor?: unknown; push?: Partial<SyncRows> };
    try {
      b = await c.req.json();
    } catch {
      return c.json({ error: "invalid" }, 400);
    }
    const push: SyncRows = {
      debtors: Array.isArray(b.push?.debtors) ? b.push.debtors : [],
      transactions: Array.isArray(b.push?.transactions) ? b.push.transactions : [],
      debtorEvents: Array.isArray(b.push?.debtorEvents) ? b.push.debtorEvents : [],
    };
    if (push.debtors.length + push.transactions.length + push.debtorEvents.length > MAX_PUSH_ROWS) {
      return c.json({ error: "too_many_rows" }, 413);
    }
    const cursor = typeof b.cursor === "number" && b.cursor >= 0 ? b.cursor : 0;
    return c.json(await runSync(c.get("deps").db, me.bookId, cursor, push));
  });
  return r;
}
