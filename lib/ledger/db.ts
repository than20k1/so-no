import Dexie, { type EntityTable, type Transaction as DexieTransaction } from "dexie";
import { newId } from "../id";
import type { Book, Debtor, DebtorEvent, Meta, SyncMark, Transaction } from "./types";

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
    // Bản 3: đồng bộ lên server. Đánh dấu mọi dòng cũ là chờ đẩy, để lần đăng nhập đầu đưa cả sổ lên.
    this.version(3)
      .stores({
        debtors: "id, bookId, searchKey, lastTxAt, _dirty",
        transactions: "id, bookId, debtorId, createdAt, _dirty",
        debtorEvents: "id, debtorId, bookId, at, _dirty",
      })
      .upgrade(async (tx) => {
        for (const name of SYNCED_TABLES) {
          await tx
            .table(name)
            .toCollection()
            .modify((row: SyncMark) => {
              row._dirty = 1;
            });
        }
      });
    this.markDirtyOnWrite();
  }

  /**
   * Mọi lần ghi từ app tự đánh dấu `_dirty = 1` (design D8). Ghi từ lớp đồng bộ (dữ liệu kéo về từ server)
   * thì không đánh dấu. Sửa cột chỉ là cache trên máy (số dư, lần giao dịch gần nhất) cũng không đánh dấu,
   * để không đẩy đè tên người nợ mà máy khác vừa đổi.
   */
  private markDirtyOnWrite() {
    for (const name of SYNCED_TABLES) {
      const table = this.table(name);
      table.hook("creating", (_key, obj: SyncMark, trans) => {
        if (!isRemoteWrite(trans)) obj._dirty = 1;
      });
      table.hook("updating", (mods: object, _key, _obj, trans) => {
        if (isRemoteWrite(trans)) return;
        if (Object.keys(mods).some((k) => SYNCED_FIELDS[name].has(k))) return { _dirty: 1 };
      });
    }
  }
}

const SYNCED_TABLES = ["debtors", "transactions", "debtorEvents"] as const;
type SyncedTable = (typeof SYNCED_TABLES)[number];

/** Cột mà server lưu. Cột khác (balance, lastTxAt, _dirty) chỉ có trên máy. */
const SYNCED_FIELDS: Record<SyncedTable, Set<string>> = {
  debtors: new Set(["bookId", "name", "note", "searchKey", "createdAt", "deletedAt", "purgedAt"]),
  transactions: new Set(["bookId", "debtorId", "amount", "kind", "direction", "occurredAt", "createdAt", "voidedAt", "source", "note", "deviceId"]),
  debtorEvents: new Set(["bookId", "debtorId", "kind", "before", "after", "at", "deviceId"]),
};

type MarkableTransaction = DexieTransaction & { __remoteWrite?: boolean };

/** Đánh dấu transaction hiện tại là "ghi từ server" — hook sẽ không đánh dấu `_dirty`. */
export function markRemoteWrite(): void {
  const tx = Dexie.currentTransaction as MarkableTransaction | null;
  if (tx) tx.__remoteWrite = true;
}

function isRemoteWrite(trans: DexieTransaction): boolean {
  let t: MarkableTransaction | null = trans as MarkableTransaction;
  // Transaction con (lồng trong transaction của lớp đồng bộ) kế thừa đánh dấu của transaction cha.
  while (t) {
    if (t.__remoteWrite) return true;
    t = (t as unknown as { parent?: MarkableTransaction }).parent ?? null;
  }
  return false;
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

/** Quên sổ đã nhớ trong bộ nhớ — gọi sau khi lớp đồng bộ đổi `currentBookId` (gắn sổ với tài khoản). */
export function forgetContext(): void {
  context = null;
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

/** Chỉ dùng trong test: giả lập nhiều máy — chuyển sang DB tên khác (giữ nguyên dữ liệu của DB cũ). */
export function switchDbForTests(name: string): void {
  db?.close();
  db = new SoNoDB(name);
  context = null;
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
