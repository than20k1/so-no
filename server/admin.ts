// Công cụ quản trị (design D13) — chạy riêng bằng scripts/admin-restore.ts, không có đường vào từ app.
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { normalizeName } from "../lib/text.js";
import type { Db } from "./db/client.js";
import * as schema from "./db/schema.js";
import { normalizePhone } from "./phone.js";

export interface RestoreMatch {
  id: string;
  name: string;
  note: string;
  deletedAt: number | null;
  purgedAt: number | null;
}

/**
 * Tìm người nợ đã xoá (trong thùng rác hoặc đã xoá hẳn) của tài khoản theo SĐT + tên (không dấu, chứa chuỗi).
 * `apply = false` chỉ liệt kê. `apply = true` khôi phục tất cả kết quả khớp và ghi sự kiện "restore" từ "admin".
 */
export async function adminRestore(db: Db, phoneInput: string, nameQuery: string, apply: boolean, now = Date.now()) {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new Error("Số điện thoại không hợp lệ");
  const [owner] = await db.select().from(schema.user).where(eq(schema.user.phoneNumber, phone));
  if (!owner) throw new Error("Không có tài khoản với số này");
  const [book] = await db.select().from(schema.books).where(eq(schema.books.ownerUserId, owner.id));
  if (!book) return { matches: [] as RestoreMatch[], restored: 0 };

  const key = normalizeName(nameQuery);
  const deleted = await db
    .select()
    .from(schema.debtors)
    .where(and(eq(schema.debtors.bookId, book.id), isNotNull(schema.debtors.deletedAt)));
  const matches: RestoreMatch[] = deleted
    .filter((d) => d.searchKey.includes(key))
    .map(({ id, name, note, deletedAt, purgedAt }) => ({ id, name, note, deletedAt, purgedAt }));
  if (!apply || matches.length === 0) return { matches, restored: 0 };

  await db.transaction(async (tx) => {
    // Cùng khoá sổ với /api/sync để thứ tự seq không bị xen ngang.
    await tx.select({ id: schema.books.id }).from(schema.books).where(eq(schema.books.id, book.id)).for("update");
    for (const m of matches) {
      await tx
        .update(schema.debtors)
        .set({ deletedAt: null, purgedAt: null, serverDeletedAt: null, updatedAt: now, seq: sql`nextval('sync_seq')` })
        .where(eq(schema.debtors.id, m.id));
      await tx.insert(schema.debtorEvents).values({
        id: crypto.randomUUID(),
        bookId: book.id,
        debtorId: m.id,
        kind: "restore",
        before: null,
        after: null,
        at: now,
        deviceId: "admin",
      });
    }
  });
  return { matches, restored: matches.length };
}
