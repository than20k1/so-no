import { newId } from "../id";
import { MAX_AMOUNT } from "../money";
import { resolveDebtor } from "../resolve";
import { requestPersistentStorage } from "../storage";
import { cleanDisplayName, normalizeName } from "../text";
import { getContext, getDb, getMeta, readBookId, setMeta } from "./db";
import { signedAmount, type Debtor, type Transaction, type TxKind, type TxSource } from "./types";

export type DebtorTarget = { debtorId: string } | { newDebtor: { name: string; note?: string } };

export interface RecordInput {
  target: DebtorTarget;
  amount: number;
  note?: string;
}

export interface RecordResult {
  transaction: Transaction;
  debtor: Debtor;
}

export class LedgerError extends Error {
  constructor(
    public code:
      | "invalid_amount"
      | "invalid_name"
      | "debtor_not_found"
      | "debtor_deleted"
      | "purge_too_early"
      | "tx_not_found",
    message = code,
  ) {
    super(message);
  }
}

function assertAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new LedgerError("invalid_amount");
  }
}

function makeDebtor(bookId: string, name: string, note: string, now: number): Debtor {
  const display = cleanDisplayName(name);
  if (!display) throw new LedgerError("invalid_name");
  return {
    id: newId(),
    bookId,
    name: display,
    note: cleanDisplayName(note),
    searchKey: normalizeName(display),
    balance: 0,
    lastTxAt: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    purgedAt: null,
  };
}

async function record(kind: TxKind, input: RecordInput): Promise<RecordResult> {
  assertAmount(input.amount);
  const { bookId, deviceId } = await getContext();
  const d = getDb();

  const result = await d.transaction("rw", d.debtors, d.transactions, async () => {
    const now = Date.now();
    let debtor: Debtor;
    if ("debtorId" in input.target) {
      const found = await d.debtors.get(input.target.debtorId);
      if (!found || found.purgedAt) throw new LedgerError("debtor_not_found");
      // Người trong thùng rác phải được khôi phục trước (spec debtor-management).
      if (found.deletedAt) throw new LedgerError("debtor_deleted");
      debtor = found;
    } else {
      // Trừ nợ chỉ dành cho người đã có (spec debt-recording).
      if (kind === "pay") throw new LedgerError("debtor_not_found");
      debtor = makeDebtor(bookId, input.target.newDebtor.name, input.target.newDebtor.note ?? "", now);
    }

    const transaction: Transaction = {
      id: newId(),
      bookId,
      debtorId: debtor.id,
      amount: input.amount,
      kind,
      direction: "they_owe",
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
      voidedAt: null,
      source: "manual",
      note: cleanDisplayName(input.note ?? ""),
      deviceId,
    };

    debtor = {
      ...debtor,
      balance: debtor.balance + signedAmount(transaction),
      lastTxAt: now,
      updatedAt: now,
    };
    await d.debtors.put(debtor);
    await d.transactions.add(transaction);
    return { transaction, debtor };
  });

  // Chạy ngầm, không chặn thao tác lưu; lỗi ở bước tùy chọn này bị bỏ qua.
  requestPersistenceOnce().catch(() => {});
  return result;
}

/** Ghi nợ cho người đã có hoặc tạo người mới trong cùng thao tác. */
export function addDebt(input: RecordInput): Promise<RecordResult> {
  return record("add", input);
}

/** Trừ nợ — chỉ cho người đã có trong sổ. */
export function payDebt(input: RecordInput): Promise<RecordResult> {
  return record("pay", input);
}

async function requestPersistenceOnce() {
  if (await getMeta<boolean>("persistRequested")) return;
  await setMeta("persistRequested", true);
  await requestPersistentStorage();
}

/** Hoàn tác = đánh dấu hủy (giữ dòng làm chứng cứ), trừ lại tác động lên số dư. */
export async function voidTransaction(txId: string): Promise<Transaction> {
  const d = getDb();
  return d.transaction("rw", d.debtors, d.transactions, async () => {
    const tx = await d.transactions.get(txId);
    if (!tx) throw new LedgerError("tx_not_found");
    if (tx.voidedAt !== null) return tx;

    const now = Date.now();
    const voided: Transaction = { ...tx, voidedAt: now, updatedAt: now };
    await d.transactions.put(voided);

    const debtor = await d.debtors.get(tx.debtorId);
    if (debtor) {
      await d.debtors.put({ ...debtor, balance: debtor.balance - signedAmount(tx), updatedAt: now });
    }
    return voided;
  });
}

/** Tính lại số dư và lần giao dịch gần nhất từ lịch sử — dùng sau khi nhập và để đối chiếu cache. */
export async function recomputeBalance(debtorId: string): Promise<Debtor | undefined> {
  const d = getDb();
  return d.transaction("rw", d.debtors, d.transactions, async () => {
    const debtor = await d.debtors.get(debtorId);
    if (!debtor) return undefined;
    const txs = await d.transactions.where("debtorId").equals(debtorId).toArray();
    let balance = 0;
    let lastTxAt = 0;
    for (const tx of txs) {
      if (tx.voidedAt === null) balance += signedAmount(tx);
      lastTxAt = Math.max(lastTxAt, tx.createdAt);
    }
    const updated = { ...debtor, balance, lastTxAt };
    if (updated.balance !== debtor.balance || updated.lastTxAt !== debtor.lastTxAt) {
      updated.updatedAt = Date.now();
      await d.debtors.put(updated);
    }
    return updated;
  });
}

/** Người nợ đang dùng (chưa cho vào thùng rác) — nguồn chung cho màn chính, gợi ý và ghép tên. */
export function isActive(d: Debtor): boolean {
  return !d.deletedAt;
}

/** Người nợ đang dùng của sổ hiện tại. */
export async function listDebtors(): Promise<Debtor[]> {
  const bookId = await readBookId();
  if (!bookId) return [];
  return getDb().debtors.where("bookId").equals(bookId).filter(isActive).toArray();
}

/** Cả người trong thùng rác; người đã xoá hẳn coi như không tồn tại. */
export async function getDebtor(id: string): Promise<Debtor | undefined> {
  const debtor = await getDb().debtors.get(id);
  return debtor && !debtor.purgedAt ? debtor : undefined;
}

/** Lịch sử của một người, mới nhất ở trên. */
export async function getHistory(debtorId: string): Promise<Transaction[]> {
  const txs = await getDb().transactions.where("debtorId").equals(debtorId).toArray();
  return txs.sort((a, b) => b.createdAt - a.createdAt);
}

// ---------------------------------------------------------------------------
// Đường nhập hàng loạt dùng chung (sao lưu, quét sổ giấy ở bản sau)
// ---------------------------------------------------------------------------

export interface ImportRow {
  name: string;
  /** Ghi chú phân biệt cho người mới. */
  debtorNote?: string;
  amount: number;
  kind: TxKind;
  occurredAt?: number | null;
  note?: string;
}

export type ImportRowError = { index: number; reason: "invalid_name" | "invalid_amount" | "invalid_kind" | "ambiguous_name" };

export type ImportBatchResult =
  | { ok: true; transactions: Transaction[]; createdDebtors: Debtor[] }
  | { ok: false; errors: ImportRowError[] };

/**
 * Ghi nhiều dòng trong một thao tác nguyên tử. Kiểm tra toàn bộ trước;
 * chỉ cần một dòng lỗi thì không ghi dòng nào.
 */
export async function importBatch(rows: ImportRow[], source: TxSource): Promise<ImportBatchResult> {
  const { bookId, deviceId } = await getContext();
  const d = getDb();

  return d.transaction("rw", d.debtors, d.transactions, async () => {
    const existing = await d.debtors.where("bookId").equals(bookId).filter(isActive).toArray();
    const now = Date.now();
    const errors: ImportRowError[] = [];
    // Người mới tạo trong cùng lô được dùng lại cho các dòng sau có cùng tên.
    const created = new Map<string, Debtor>();
    const planned: { row: ImportRow; debtor: Debtor }[] = [];

    rows.forEach((row, index) => {
      if (!cleanDisplayName(row.name ?? "")) return errors.push({ index, reason: "invalid_name" });
      if (!Number.isInteger(row.amount) || row.amount <= 0 || row.amount > MAX_AMOUNT) {
        return errors.push({ index, reason: "invalid_amount" });
      }
      if (row.kind !== "add" && row.kind !== "pay") return errors.push({ index, reason: "invalid_kind" });

      const resolved = resolveDebtor(row.name, existing);
      if (resolved.type === "ambiguous") return errors.push({ index, reason: "ambiguous_name" });
      if (resolved.type === "existing") return planned.push({ row, debtor: resolved.debtor });

      const key = normalizeName(row.name);
      let debtor = created.get(key);
      if (!debtor) {
        debtor = makeDebtor(bookId, row.name, row.debtorNote ?? "", now);
        created.set(key, debtor);
      }
      planned.push({ row, debtor });
    });

    if (errors.length > 0) return { ok: false as const, errors };

    const transactions: Transaction[] = planned.map(({ row, debtor }) => ({
      id: newId(),
      bookId,
      debtorId: debtor.id,
      amount: row.amount,
      kind: row.kind,
      direction: "they_owe",
      occurredAt: row.occurredAt ?? null,
      createdAt: now,
      updatedAt: now,
      voidedAt: null,
      source,
      note: cleanDisplayName(row.note ?? ""),
      deviceId,
    }));

    await d.debtors.bulkAdd([...created.values()]);
    await d.transactions.bulkAdd(transactions);
    const touched = new Set(transactions.map((t) => t.debtorId));
    for (const id of touched) await recomputeBalance(id);

    return { ok: true as const, transactions, createdDebtors: [...created.values()] };
  });
}
