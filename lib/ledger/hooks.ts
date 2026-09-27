"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getBackupState, needsBackupReminder } from "./backup";
import { getDebtorEvents, listTrash } from "./debtors";
import { getDebtor, getHistory, listDebtors } from "./ledger";
import type { Debtor, DebtorEvent, Transaction } from "./types";

/** Toàn bộ người nợ của sổ hiện tại; `undefined` khi đang tải lần đầu. Tự cập nhật khi dữ liệu đổi. */
export function useDebtors(): Debtor[] | undefined {
  return useLiveQuery(listDebtors, []);
}

/** `null` = không tìm thấy; `undefined` = đang tải. */
export function useDebtor(id: string | null): Debtor | null | undefined {
  return useLiveQuery(async () => (id ? ((await getDebtor(id)) ?? null) : null), [id]);
}

export function useHistory(debtorId: string | null): Transaction[] | undefined {
  return useLiveQuery(async () => (debtorId ? getHistory(debtorId) : []), [debtorId]);
}

/** Có cần hiện lời nhắc sao lưu không (spec backup-restore). */
export function useBackupReminder(): boolean {
  return useLiveQuery(async () => needsBackupReminder(await getBackupState()), [], false);
}

/** Sổ đã có ít nhất một giao dịch chưa — dùng cho gợi ý cài app. */
export function useHasTransactions(): boolean {
  return useLiveQuery(async () => (await getBackupState()).lastTxAt !== null, [], false);
}

/** Người trong thùng rác; `undefined` khi đang tải. */
export function useTrash(): Debtor[] | undefined {
  return useLiveQuery(listTrash, []);
}

/** Số người trong thùng rác — cho mục "Thùng rác (n)" của menu. */
export function useTrashCount(): number {
  return useLiveQuery(async () => (await listTrash()).length, [], 0);
}

/** Lịch sử sửa của một người, mới nhất ở trên. */
export function useDebtorEvents(debtorId: string | null): DebtorEvent[] | undefined {
  return useLiveQuery(async () => (debtorId ? getDebtorEvents(debtorId) : []), [debtorId]);
}
