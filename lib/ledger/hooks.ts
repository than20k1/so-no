"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getBackupState, needsBackupReminder } from "./backup";
import { getDebtor, getHistory, listDebtors } from "./ledger";
import type { Debtor, Transaction } from "./types";

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
