export type TxKind = "add" | "pay";
/** Chiều nợ. Bản 1 chỉ dùng `they_owe` (khách nợ mình); `i_owe` dành cho bản sau. */
export type TxDirection = "they_owe" | "i_owe";
export type TxSource = "manual" | "backup" | "scan";

/** Sổ nợ. Bản 1 có đúng một sổ mặc định; nhiều người dùng chung sổ ở bản sau. */
export interface Book {
  id: string;
  name: string;
  createdAt: number;
}

export interface Debtor {
  id: string;
  bookId: string;
  name: string;
  /** Ghi chú phân biệt người trùng tên, ví dụ "rau", "cá". */
  note: string;
  /** Tên đã bỏ dấu, chữ thường — xem `normalizeName`. */
  searchKey: string;
  /** Cache số dư = tổng ghi nợ − tổng trừ nợ của giao dịch chưa hủy. */
  balance: number;
  /** Thời điểm tạo giao dịch gần nhất (kể cả đã hủy); 0 nếu chưa có. */
  lastTxAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface Transaction {
  id: string;
  bookId: string;
  debtorId: string;
  /** Số nguyên đồng, luôn dương. */
  amount: number;
  kind: TxKind;
  direction: TxDirection;
  /** Ngày xảy ra thật (ví dụ ngày trong sổ giấy); `null` nếu không rõ. */
  occurredAt: number | null;
  /** Do app tự ghi lúc lưu, không bao giờ sửa. */
  createdAt: number;
  updatedAt: number;
  /** `null` = còn hiệu lực. */
  voidedAt: number | null;
  source: TxSource;
  note: string;
  deviceId: string;
}

export interface Meta {
  key: string;
  value: unknown;
}

/** Tác động của một giao dịch lên số dư. */
export function signedAmount(tx: Pick<Transaction, "amount" | "kind">): number {
  return tx.kind === "add" ? tx.amount : -tx.amount;
}
