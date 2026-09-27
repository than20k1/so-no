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

it("nâng DB bản 3 lên bản 4: sổ cũ còn nguyên (không bị đánh dấu lại), có bảng nhóm, ghi vào nhóm thì chờ đẩy", async () => {
  const old = new Dexie("so-no");
  old.version(3).stores({
    books: "id",
    debtors: "id, bookId, searchKey, lastTxAt, _dirty",
    transactions: "id, bookId, debtorId, createdAt, _dirty",
    meta: "key",
    debtorEvents: "id, debtorId, bookId, at, _dirty",
  });
  await old.table("books").add({ id: "b1", name: "Sổ nợ", createdAt: 1 });
  await old.table("meta").bulkAdd([
    { key: "currentBookId", value: "b1" },
    { key: "deviceId", value: "dev1" },
  ]);
  await old.table("debtors").add({
    id: "d1", bookId: "b1", name: "Chị Lan", note: "", searchKey: "chi lan", balance: 50000, lastTxAt: 2,
    createdAt: 1, updatedAt: 2, deletedAt: null, purgedAt: null, _dirty: 0,
  });
  old.close();

  const d = getDb();
  expect((await d.debtors.get("d1"))?._dirty).toBe(0);
  expect((await listDebtors()).map((x) => x.name)).toEqual(["Chị Lan"]);
  await d.groups.add({ id: "g1", name: "Đà Lạt", createdAt: 1, updatedAt: 1, deletedAt: null });
  expect((await d.groups.get("g1"))?._dirty).toBe(1);
});
