import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getContext, getDb, resetDbForTests } from "./db";
import {
  addDebt,
  getHistory,
  importBatch,
  LedgerError,
  listDebtors,
  payDebt,
  recomputeBalance,
  voidTransaction,
} from "./ledger";

beforeEach(async () => {
  await resetDbForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const newLan = { newDebtor: { name: "Chị Lan", note: "rau" } };

describe("khởi tạo", () => {
  it("DB mới có đúng 1 sổ và 1 deviceId", async () => {
    expect(await listDebtors()).toEqual([]);
    await Promise.all([getContext(), getContext()]);
    await getContext();
    const d = getDb();
    expect(await d.books.count()).toBe(1);
    expect((await d.meta.get("deviceId"))?.value).toBeTypeOf("string");
  });
});

describe("ghi nợ / trừ nợ", () => {
  it("tạo người mới và tính số dư sau chuỗi ghi/trừ", async () => {
    const first = await addDebt({ target: newLan, amount: 200000 });
    const id = first.debtor.id;
    await addDebt({ target: { debtorId: id }, amount: 50000 });
    const pay = await payDebt({ target: { debtorId: id }, amount: 100000 });

    expect(pay.debtor.balance).toBe(150000);
    expect(first.debtor).toMatchObject({ name: "Chị Lan", note: "rau", searchKey: "chi lan" });
    expect(first.transaction).toMatchObject({
      direction: "they_owe",
      source: "manual",
      kind: "add",
      voidedAt: null,
    });
    expect(first.transaction.occurredAt).toBe(first.transaction.createdAt);

    const history = await getHistory(id);
    expect(history).toHaveLength(3);
    expect(history[0].id).toBe(pay.transaction.id);
  });

  it("trừ nợ tạo dòng mới, không sửa dòng cũ", async () => {
    const a = await addDebt({ target: newLan, amount: 250000 });
    const before = await getDb().transactions.get(a.transaction.id);
    await payDebt({ target: { debtorId: a.debtor.id }, amount: 100000 });
    expect(await getDb().transactions.get(a.transaction.id)).toEqual(before);
    expect(await getDb().transactions.count()).toBe(2);
  });

  it("từ chối số tiền không hợp lệ và trừ nợ cho người mới", async () => {
    await expect(addDebt({ target: newLan, amount: 0 })).rejects.toBeInstanceOf(LedgerError);
    await expect(addDebt({ target: newLan, amount: 1.5 })).rejects.toBeInstanceOf(LedgerError);
    await expect(payDebt({ target: newLan, amount: 1000 })).rejects.toBeInstanceOf(LedgerError);
    expect(await getDb().debtors.count()).toBe(0);
  });

  it("xin lưu trữ bền vững sau giao dịch đầu tiên", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", { storage: { persist, persisted: vi.fn().mockResolvedValue(false) } });
    const a = await addDebt({ target: newLan, amount: 1000 });
    await addDebt({ target: { debtorId: a.debtor.id }, amount: 1000 });
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
  });

  it("không lỗi khi trình duyệt không hỗ trợ lưu trữ bền vững", async () => {
    vi.stubGlobal("navigator", {});
    await expect(addDebt({ target: newLan, amount: 1000 })).resolves.toBeTruthy();
  });
});

describe("hoàn tác", () => {
  it("số dư quay về, dòng vẫn tồn tại với voidedAt", async () => {
    const a = await addDebt({ target: newLan, amount: 200000 });
    const b = await addDebt({ target: { debtorId: a.debtor.id }, amount: 30000 });
    const voided = await voidTransaction(b.transaction.id);

    expect(voided.voidedAt).toBeTypeOf("number");
    const stored = await getDb().transactions.get(b.transaction.id);
    expect(stored?.voidedAt).toBe(voided.voidedAt);
    expect((await getDb().debtors.get(a.debtor.id))?.balance).toBe(200000);

    // Hủy lần 2 không trừ thêm.
    await voidTransaction(b.transaction.id);
    expect((await getDb().debtors.get(a.debtor.id))?.balance).toBe(200000);
  });

  it("hoàn tác giao dịch đầu của người mới → số dư 0", async () => {
    const a = await addDebt({ target: { newDebtor: { name: "Bác Hùng" } }, amount: 80000 });
    await voidTransaction(a.transaction.id);
    const debtors = await listDebtors();
    expect(debtors.filter((d) => d.balance > 0)).toHaveLength(0);
  });
});

describe("recomputeBalance", () => {
  it("cache số dư khớp giá trị tính lại sau 200 thao tác ngẫu nhiên", async () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

    const ids: string[] = [];
    for (const name of ["An", "Bình", "Chi"]) {
      ids.push((await addDebt({ target: { newDebtor: { name } }, amount: 10000 })).debtor.id);
    }
    const txIds: string[] = [];
    for (let i = 0; i < 200; i++) {
      const r = rand();
      const debtorId = ids[Math.floor(rand() * ids.length)];
      const amount = (1 + Math.floor(rand() * 50)) * 1000;
      if (r < 0.5) txIds.push((await addDebt({ target: { debtorId }, amount })).transaction.id);
      else if (r < 0.85) txIds.push((await payDebt({ target: { debtorId }, amount })).transaction.id);
      else if (txIds.length) await voidTransaction(txIds[Math.floor(rand() * txIds.length)]);
    }

    for (const id of ids) {
      const cached = (await getDb().debtors.get(id))!;
      const recomputed = (await recomputeBalance(id))!;
      expect(recomputed.balance).toBe(cached.balance);
      expect(recomputed.lastTxAt).toBe(cached.lastTxAt);
    }
  });
});

describe("importBatch", () => {
  it("một dòng lỗi thì không ghi gì", async () => {
    const result = await importBatch(
      [
        { name: "An", amount: 10000, kind: "add" },
        { name: "Bình", amount: -5000, kind: "add" },
        { name: "Chi", amount: 20000, kind: "add" },
      ],
      "backup",
    );
    expect(result).toEqual({ ok: false, errors: [{ index: 1, reason: "invalid_amount" }] });
    expect(await getDb().transactions.count()).toBe(0);
    expect(await getDb().debtors.count()).toBe(0);
  });

  it("ghép tên với người đã có, gộp người mới trùng tên trong cùng lô", async () => {
    const lan = await addDebt({ target: newLan, amount: 100000 });
    const result = await importBatch(
      [
        { name: "chi lan", amount: 50000, kind: "add", occurredAt: null },
        { name: "Cô Ba", amount: 1200000, kind: "add", occurredAt: Date.UTC(2026, 4, 12) },
        { name: "co ba", amount: 200000, kind: "pay" },
      ],
      "scan",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.createdDebtors).toHaveLength(1);
    expect(result.transactions.every((t) => t.source === "scan")).toBe(true);
    expect(result.transactions[0].occurredAt).toBeNull();

    const debtors = await listDebtors();
    expect(debtors).toHaveLength(2);
    expect(debtors.find((d) => d.id === lan.debtor.id)?.balance).toBe(150000);
    expect(debtors.find((d) => d.searchKey === "co ba")?.balance).toBe(1000000);
  });

  it("tên trùng nhiều người → lỗi ambiguous_name", async () => {
    await addDebt({ target: newLan, amount: 1000 });
    await addDebt({ target: { newDebtor: { name: "Chị Lan", note: "cá" } }, amount: 1000 });
    const result = await importBatch([{ name: "Chi Lan", amount: 1000, kind: "add" }], "backup");
    expect(result).toEqual({ ok: false, errors: [{ index: 0, reason: "ambiguous_name" }] });
  });
});
