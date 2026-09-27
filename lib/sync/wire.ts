// Dạng dữ liệu trao đổi với POST /api/sync — khớp server/sync.ts.
import type { Debtor, DebtorEvent, Transaction } from "../ledger/types";

export type WireDebtor = Omit<Debtor, "balance" | "lastTxAt" | "_dirty">;
export type WireTransaction = Omit<Transaction, "_dirty">;
export type WireEvent = Omit<DebtorEvent, "_dirty">;

export interface WireRows {
  debtors: WireDebtor[];
  transactions: WireTransaction[];
  debtorEvents: WireEvent[];
}

export interface SyncResponseBody {
  cursor: number;
  pull: WireRows;
  hasMore: boolean;
  rejected: { table: keyof WireRows; id: string; reason: "invalid" | "foreign" | "orphan" | "purge_too_early" }[];
  serverNow: number;
}

export function toWireDebtor(d: Debtor): WireDebtor {
  return {
    id: d.id,
    bookId: d.bookId,
    name: d.name,
    note: d.note,
    searchKey: d.searchKey,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    deletedAt: d.deletedAt ?? null,
    purgedAt: d.purgedAt ?? null,
  };
}

export function toWireTransaction(t: Transaction): WireTransaction {
  const copy: Transaction = { ...t };
  delete copy._dirty;
  return copy;
}

export function toWireEvent(e: DebtorEvent): WireEvent {
  const copy: DebtorEvent = { ...e };
  delete copy._dirty;
  return copy;
}
