// Gắn sổ trên máy với tài khoản (design D9).
import { forgetContext, getDb, getMeta, setMeta } from "../ledger/db";
import { META } from "./engine";

export interface Me {
  userId: string;
  phone: string;
  bookId: string;
}

export const ACCOUNT_META = "accountUserId";

export type AttachResult = "attached" | "same" | "mismatch";

/**
 * Máy chưa từng đăng nhập → đưa cả sổ trên máy vào sổ của tài khoản (đổi bookId, mọi dòng thành chờ đẩy).
 * Cùng tài khoản → dùng tiếp. Khác tài khoản → "mismatch": không gộp chéo, để giao diện hỏi người dùng.
 */
export async function attachAccount(me: Me): Promise<AttachResult> {
  const owner = await getMeta<string>(ACCOUNT_META);
  if (owner === me.userId) return "same";
  if (owner && owner !== me.userId) return "mismatch";

  const d = getDb();
  await d.transaction("rw", [d.books, d.debtors, d.transactions, d.debtorEvents, d.meta], async () => {
    // Đổi bookId qua hook → mọi dòng thành `_dirty = 1`, được đẩy lên ở lượt đồng bộ đầu.
    await d.debtors.toCollection().modify({ bookId: me.bookId });
    await d.transactions.toCollection().modify({ bookId: me.bookId });
    await d.debtorEvents.toCollection().modify({ bookId: me.bookId });
    if (!(await d.books.get(me.bookId))) await d.books.add({ id: me.bookId, name: "Sổ nợ", createdAt: Date.now() });
    await setMeta("currentBookId", me.bookId);
    await setMeta(ACCOUNT_META, me.userId);
    await setMeta(META.cursor, 0);
  });
  forgetContext();
  return "attached";
}

/** Xoá sổ trên máy (giữ mã thiết bị). Dùng khi đăng xuất chọn xoá sổ, hoặc khi đăng nhập tài khoản khác. */
export async function wipeLocalBook(): Promise<void> {
  const d = getDb();
  await d.transaction("rw", [d.books, d.debtors, d.transactions, d.debtorEvents, d.meta], async () => {
    await Promise.all([d.books.clear(), d.debtors.clear(), d.transactions.clear(), d.debtorEvents.clear()]);
    for (const key of ["currentBookId", ACCOUNT_META, META.cursor, META.serverOffset, META.lastSyncAt]) {
      await d.meta.delete(key);
    }
  });
  forgetContext();
}
