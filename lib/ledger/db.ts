import Dexie, { type EntityTable } from "dexie";
import { newId } from "../id";
import type { Book, Debtor, DebtorEvent, Meta, Transaction } from "./types";

export class SoNoDB extends Dexie {
  books!: EntityTable<Book, "id">;
  debtors!: EntityTable<Debtor, "id">;
  transactions!: EntityTable<Transaction, "id">;
  meta!: EntityTable<Meta, "key">;
  debtorEvents!: EntityTable<DebtorEvent, "id">;

  constructor(name = "so-no") {
    super(name);
    // Chỉ thêm version mới khi đổi schema, không xóa bảng cũ — xem design "Migration Plan".
    this.version(1).stores({
      books: "id",
      debtors: "id, bookId, searchKey, lastTxAt",
      transactions: "id, bookId, debtorId, createdAt",
      meta: "key",
    });
    // Bản 2: sửa/xoá người nợ. Người nợ cũ được coi là chưa xoá.
    this.version(2)
      .stores({ debtorEvents: "id, debtorId, bookId, at" })
      .upgrade((tx) =>
        tx
          .table("debtors")
          .toCollection()
          .modify((d: Partial<Debtor>) => {
            d.deletedAt ??= null;
            d.purgedAt ??= null;
          }),
      );
  }
}

let db: SoNoDB | null = null;
let context: Promise<LedgerContext> | null = null;

export interface LedgerContext {
  bookId: string;
  deviceId: string;
}

/** Mở DB lười — không chạm IndexedDB lúc prerender trên server. */
export function getDb(): SoNoDB {
  db ??= new SoNoDB();
  return db;
}

/** Tạo sổ mặc định và mã thiết bị ở lần mở đầu tiên; các lần sau chỉ đọc lại. */
export function getContext(): Promise<LedgerContext> {
  context ??= initContext().catch((err) => {
    context = null;
    throw err;
  });
  return context;
}

async function initContext(): Promise<LedgerContext> {
  const d = getDb();
  return d.transaction("rw", d.books, d.meta, async () => {
    let deviceId = (await d.meta.get("deviceId"))?.value as string | undefined;
    if (!deviceId) {
      deviceId = newId();
      await d.meta.put({ key: "deviceId", value: deviceId });
    }
    let bookId = (await d.meta.get("currentBookId"))?.value as string | undefined;
    if (!bookId) {
      bookId = newId();
      await d.books.add({ id: bookId, name: "Sổ nợ", createdAt: Date.now() });
      await d.meta.put({ key: "currentBookId", value: bookId });
    }
    return { bookId, deviceId };
  });
}

/**
 * Chỉ đọc mã sổ hiện tại (không ghi) — an toàn trong truy vấn live (transaction chỉ-đọc).
 * `undefined` nếu sổ chưa được khởi tạo; `getContext()` chạy lúc app mở sẽ tạo và kích hoạt truy vấn chạy lại.
 */
export async function readBookId(): Promise<string | undefined> {
  return (await getDb().meta.get("currentBookId"))?.value as string | undefined;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await getDb().meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await getDb().meta.put({ key, value });
}

/** Chỉ dùng trong test: đóng và xóa DB để mỗi test bắt đầu từ sổ trống. */
export async function resetDbForTests(): Promise<void> {
  if (db) {
    db.close();
    await db.delete();
  }
  db = null;
  context = null;
}
