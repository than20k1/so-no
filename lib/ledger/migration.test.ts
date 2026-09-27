import Dexie from "dexie";
import { beforeEach, expect, it } from "vitest";
import { getDb, resetDbForTests } from "./db";
import { listDebtors } from "./ledger";

beforeEach(async () => {
  await resetDbForTests();
  await Dexie.delete("so-no");
});

it("nâng DB bản 1 lên bản 2: người nợ cũ được coi là chưa xoá và vẫn đọc được", async () => {
  // Dựng DB đúng như bản 1 đã lưu trên máy người dùng.
  const old = new Dexie("so-no");
  old.version(1).stores({
    books: "id",
    debtors: "id, bookId, searchKey, lastTxAt",
    transactions: "id, bookId, debtorId, createdAt",
    meta: "key",
  });
  await old.table("books").add({ id: "b1", name: "Sổ nợ", createdAt: 1 });
  await old.table("meta").bulkAdd([
    { key: "currentBookId", value: "b1" },
    { key: "deviceId", value: "dev1" },
  ]);
  await old.table("debtors").add({
    id: "d1",
    bookId: "b1",
    name: "Chị Lan",
    note: "",
    searchKey: "chi lan",
    balance: 50000,
    lastTxAt: 2,
    createdAt: 1,
    updatedAt: 2,
  });
  old.close();

  const d = getDb();
  const lan = await d.debtors.get("d1");
  expect(lan?.deletedAt).toBeNull();
  expect(lan?.purgedAt).toBeNull();
  expect(await d.debtorEvents.count()).toBe(0);
  expect((await listDebtors()).map((x) => x.name)).toEqual(["Chị Lan"]);
});
