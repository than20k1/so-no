import { isoDay } from "../date";
import { normalizeName } from "../text";
import { getContext, getDb, getMeta, setMeta } from "./db";
import { recomputeBalance } from "./ledger";
import type { Book, Debtor, DebtorEvent, Transaction } from "./types";

export const BACKUP_FORMAT = "ghi-no-backup";
/** Bản 2 thêm lịch sử sửa và trạng thái xoá. Vẫn đọc được file bản 1. */
export const BACKUP_VERSION = 2;
const SUPPORTED_VERSIONS: readonly number[] = [1, 2];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  books: Book[];
  /** Gồm cả người đã xoá và đã xoá hẳn. */
  debtors: Debtor[];
  transactions: Transaction[];
  debtorEvents: DebtorEvent[];
}

export async function buildBackup(now = Date.now()): Promise<BackupFile> {
  await getContext();
  const d = getDb();
  const [books, debtors, transactions, debtorEvents] = await Promise.all([
    d.books.toArray(),
    d.debtors.toArray(),
    d.transactions.toArray(),
    d.debtorEvents.toArray(),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    books,
    debtors,
    transactions,
    debtorEvents,
  };
}

export function backupFileName(now = Date.now()): string {
  return `ghi-no-${isoDay(now)}.json`;
}

/** Ghi nhận thời điểm sao lưu thành công — dùng cho lời nhắc sao lưu. */
export async function markBackedUp(now = Date.now()): Promise<void> {
  await setMeta("lastBackupAt", now);
}

export type ParseBackupResult =
  | { ok: true; data: BackupFile }
  | { ok: false; error: "invalid_json" | "wrong_format" | "unsupported_version" | "invalid_data" };

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);

function validDebtor(v: unknown): v is Debtor {
  const d = v as Debtor;
  return !!d && isStr(d.id) && isStr(d.name) && d.name.trim() !== "" && isNum(d.createdAt);
}

const EVENT_KINDS = new Set(["edit", "delete", "restore", "purge"]);

function validEvent(v: unknown): v is DebtorEvent {
  const e = v as DebtorEvent;
  return !!e && isStr(e.id) && isStr(e.debtorId) && EVENT_KINDS.has(e.kind) && isNum(e.at);
}

function validTx(v: unknown): v is Transaction {
  const t = v as Transaction;
  return (
    !!t &&
    isStr(t.id) &&
    isStr(t.debtorId) &&
    Number.isInteger(t.amount) &&
    t.amount > 0 &&
    (t.kind === "add" || t.kind === "pay") &&
    isNum(t.createdAt) &&
    isNumOrNull(t.occurredAt ?? null) &&
    isNumOrNull(t.voidedAt ?? null)
  );
}

/** Kiểm tra định dạng file trước khi ghi bất cứ thứ gì. */
export function parseBackup(text: string): ParseBackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  const f = raw as Partial<BackupFile>;
  if (!f || typeof f !== "object" || f.format !== BACKUP_FORMAT) return { ok: false, error: "wrong_format" };
  if (!SUPPORTED_VERSIONS.includes(f.version as number)) return { ok: false, error: "unsupported_version" };
  if (!Array.isArray(f.debtors) || !Array.isArray(f.transactions)) return { ok: false, error: "invalid_data" };
  if (!f.debtors.every(validDebtor) || !f.transactions.every(validTx)) return { ok: false, error: "invalid_data" };
  // File bản 1 không có lịch sử sửa; người nợ thiếu trạng thái xoá được coi là chưa xoá khi nhập.
  const debtorEvents = f.debtorEvents ?? [];
  if (!Array.isArray(debtorEvents) || !debtorEvents.every(validEvent)) return { ok: false, error: "invalid_data" };
  return {
    ok: true,
    data: {
      ...(f as BackupFile),
      version: BACKUP_VERSION,
      books: Array.isArray(f.books) ? f.books : [],
      debtorEvents,
    },
  };
}

export interface ImportPreview {
  debtors: number;
  transactions: number;
  newDebtors: number;
  newTransactions: number;
  skipped: number;
  /** Giao dịch trỏ tới người không có trong file lẫn trên máy. */
  orphans: number;
}

export async function previewBackupImport(data: BackupFile): Promise<ImportPreview> {
  const d = getDb();
  const existingDebtorIds = new Set(await d.debtors.toCollection().primaryKeys());
  const existingTxIds = new Set(await d.transactions.toCollection().primaryKeys());
  const fileDebtorIds = new Set(data.debtors.map((x) => x.id));

  const newDebtors = data.debtors.filter((x) => !existingDebtorIds.has(x.id)).length;
  const newTransactions = data.transactions.filter((x) => !existingTxIds.has(x.id)).length;
  const orphans = data.transactions.filter(
    (x) => !fileDebtorIds.has(x.debtorId) && !existingDebtorIds.has(x.debtorId),
  ).length;

  return {
    debtors: data.debtors.length,
    transactions: data.transactions.length,
    newDebtors,
    newTransactions,
    skipped: data.debtors.length - newDebtors + data.transactions.length - newTransactions,
    orphans,
  };
}

/**
 * Gộp file sao lưu vào sổ hiện tại theo mã định danh: dòng đã có thì bỏ qua (kể cả người nợ —
 * không ghi đè trạng thái xoá trên máy), dòng mới giữ nguyên trường gốc (thời điểm tạo, nguồn,
 * trạng thái hủy, trạng thái xoá...).
 * Bản 1 chỉ có một sổ nên mọi dòng được đưa về sổ hiện tại của máy.
 */
export async function applyBackupImport(data: BackupFile): Promise<ImportPreview> {
  const preview = await previewBackupImport(data);
  if (preview.orphans > 0) throw new Error("orphan_transactions");

  const { bookId } = await getContext();
  const d = getDb();
  await d.transaction("rw", d.debtors, d.transactions, d.debtorEvents, async () => {
    const existingDebtorIds = new Set(await d.debtors.toCollection().primaryKeys());
    const existingTxIds = new Set(await d.transactions.toCollection().primaryKeys());
    const existingEventIds = new Set(await d.debtorEvents.toCollection().primaryKeys());

    const debtors: Debtor[] = data.debtors
      .filter((x) => !existingDebtorIds.has(x.id))
      .map((x) => ({
        id: x.id,
        bookId,
        name: x.name,
        note: isStr(x.note) ? x.note : "",
        searchKey: normalizeName(x.name),
        balance: 0,
        lastTxAt: 0,
        createdAt: x.createdAt,
        updatedAt: isNum(x.updatedAt) ? x.updatedAt : x.createdAt,
        deletedAt: isNum(x.deletedAt) ? x.deletedAt : null,
        purgedAt: isNum(x.purgedAt) ? x.purgedAt : null,
      }));

    const transactions: Transaction[] = data.transactions
      .filter((x) => !existingTxIds.has(x.id))
      .map((x) => ({
        id: x.id,
        bookId,
        debtorId: x.debtorId,
        amount: x.amount,
        kind: x.kind,
        direction: x.direction ?? "they_owe",
        occurredAt: x.occurredAt ?? null,
        createdAt: x.createdAt,
        updatedAt: isNum(x.updatedAt) ? x.updatedAt : x.createdAt,
        voidedAt: x.voidedAt ?? null,
        source: x.source ?? "manual",
        note: isStr(x.note) ? x.note : "",
        deviceId: isStr(x.deviceId) ? x.deviceId : "",
      }));

    const debtorEvents: DebtorEvent[] = data.debtorEvents
      .filter((x) => !existingEventIds.has(x.id))
      .map((x) => ({
        id: x.id,
        bookId,
        debtorId: x.debtorId,
        kind: x.kind,
        before: x.before ?? null,
        after: x.after ?? null,
        at: x.at,
        deviceId: isStr(x.deviceId) ? x.deviceId : "",
      }));

    await d.debtors.bulkAdd(debtors);
    await d.transactions.bulkAdd(transactions);
    await d.debtorEvents.bulkAdd(debtorEvents);

    const touched = new Set([...debtors.map((x) => x.id), ...transactions.map((x) => x.debtorId)]);
    for (const id of touched) await recomputeBalance(id);
  });
  return preview;
}

// ---------------------------------------------------------------------------
// Nhắc sao lưu
// ---------------------------------------------------------------------------

export const BACKUP_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;

export interface BackupState {
  lastBackupAt: number | null;
  firstTxAt: number | null;
  lastTxAt: number | null;
}

/** Nhắc khi đã có giao dịch mới kể từ lần sao lưu gần nhất và đã qua 7 ngày. */
export function needsBackupReminder(s: BackupState, now = Date.now()): boolean {
  if (s.lastTxAt === null) return false;
  if (s.lastBackupAt !== null && s.lastTxAt <= s.lastBackupAt) return false;
  const since = s.lastBackupAt ?? s.firstTxAt ?? s.lastTxAt;
  return now - since > BACKUP_REMINDER_MS;
}

export async function getBackupState(): Promise<BackupState> {
  const d = getDb();
  const [lastBackupAt, first, last] = await Promise.all([
    getMeta<number>("lastBackupAt"),
    d.transactions.orderBy("createdAt").first(),
    d.transactions.orderBy("createdAt").last(),
  ]);
  return {
    lastBackupAt: lastBackupAt ?? null,
    firstTxAt: first?.createdAt ?? null,
    lastTxAt: last?.createdAt ?? null,
  };
}
