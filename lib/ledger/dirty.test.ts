import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, markRemoteWrite, resetDbForTests } from "./db";
import { deleteDebtor, editDebtor } from "./debtors";
import { addDebt, payDebt, voidTransaction } from "./ledger";

beforeEach(async () => {
  await resetDbForTests();
  await Dexie.delete("so-no");
});

async function clearDirty() {
  const d = getDb();
  await d.transaction("rw", d.debtors, d.transactions, d.debtorEvents, async () => {
    markRemoteWrite();
    for (const t of [d.debtors, d.transactions, d.debtorEvents] as const) {
      await (t as typeof d.debtors).toCollection().modify({ _dirty: 0 });
    }
  });
}
const dirty = async () => {
  const d = getDb();
  return {
    debtors: await d.debtors.where("_dirty").equals(1).count(),
    transactions: await d.transactions.where("_dirty").equals(1).count(),
    events: await d.debtorEvents.where("_dirty").equals(1).count(),
  };
};

describe("đánh dấu dòng chờ đẩy", () => {
  it("ghi nợ, hủy, sửa, xoá đều đánh dấu", async () => {
    const r = await addDebt({ target: { newDebtor: { name: "Chị Lan" } }, amount: 1000 });
    expect(await dirty()).toEqual({ debtors: 1, transactions: 1, events: 0 });

    await clearDirty();
    await voidTransaction(r.transaction.id);
    // Hủy giao dịch: giao dịch đổi voidedAt → chờ đẩy; người nợ chỉ đổi số dư (cache) → không.
    expect(await dirty()).toEqual({ debtors: 0, transactions: 1, events: 0 });

    await clearDirty();
    await editDebtor(r.debtor.id, { name: "Chị Lan rau", note: "" });
    expect(await dirty()).toEqual({ debtors: 1, transactions: 0, events: 1 });

    await clearDirty();
    await deleteDebtor(r.debtor.id);
    expect(await dirty()).toEqual({ debtors: 1, transactions: 0, events: 1 });
  });

  it("ghi thêm cho người đã có: chỉ giao dịch mới chờ đẩy, người nợ (chỉ đổi số dư) thì không", async () => {
    const r = await addDebt({ target: { newDebtor: { name: "Chị Lan" } }, amount: 1000 });
    await clearDirty();
    await payDebt({ target: { debtorId: r.debtor.id }, amount: 500 });
    expect(await dirty()).toEqual({ debtors: 0, transactions: 1, events: 0 });
  });

  it("ghi từ server (markRemoteWrite) không bị đánh dấu", async () => {
    const d = getDb();
    await d.transaction("rw", d.debtors, async () => {
      markRemoteWrite();
      await d.debtors.put({
        id: crypto.randomUUID(), bookId: "b", name: "Từ server", note: "", searchKey: "tu server", balance: 0,
        lastTxAt: 0, createdAt: 1, updatedAt: 1, deletedAt: null, purgedAt: null, _dirty: 0,
      });
    });
    expect((await dirty()).debtors).toBe(0);
  });
});

it("DB bản 2 có dữ liệu nâng lên bản 3: mọi dòng cũ chờ đẩy", async () => {
  const old = new Dexie("so-no");
  old.version(2).stores({
    books: "id",
    debtors: "id, bookId, searchKey, lastTxAt",
    transactions: "id, bookId, debtorId, createdAt",
    meta: "key",
    debtorEvents: "id, debtorId, bookId, at",
  });
  await old.table("debtors").bulkAdd([{ id: "d1", bookId: "b" }, { id: "d2", bookId: "b" }]);
  await old.table("transactions").add({ id: "t1", bookId: "b", debtorId: "d1" });
  await old.table("debtorEvents").add({ id: "e1", bookId: "b", debtorId: "d1" });
  old.close();

  expect(await dirty()).toEqual({ debtors: 2, transactions: 1, events: 1 });
});
