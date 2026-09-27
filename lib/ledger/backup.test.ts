import { beforeEach, describe, expect, it } from "vitest";
import {
  applyBackupImport,
  BACKUP_REMINDER_MS,
  backupFileName,
  buildBackup,
  getBackupState,
  markBackedUp,
  needsBackupReminder,
  parseBackup,
  previewBackupImport,
} from "./backup";
import { getDb, resetDbForTests } from "./db";
import { deleteDebtor, editDebtor, getDebtorEvents, listTrash, purgeDebtor } from "./debtors";
import { addDebt, listDebtors, payDebt, voidTransaction } from "./ledger";

beforeEach(async () => {
  await resetDbForTests();
});

async function seed() {
  const lan = await addDebt({ target: { newDebtor: { name: "Chị Lan", note: "rau" } }, amount: 200000 });
  const extra = await addDebt({ target: { debtorId: lan.debtor.id }, amount: 30000 });
  await voidTransaction(extra.transaction.id);
  await payDebt({ target: { debtorId: lan.debtor.id }, amount: 100000 });
  await addDebt({ target: { newDebtor: { name: "Cô Ba" } }, amount: 1200000 });
}

describe("xuất sao lưu", () => {
  it("chứa đủ người nợ và giao dịch, kể cả đã hủy", async () => {
    await seed();
    const file = await buildBackup();
    expect(file.format).toBe("ghi-no-backup");
    expect(file.version).toBe(2);
    expect(file.debtors).toHaveLength(2);
    expect(file.transactions).toHaveLength(4);
    expect(file.transactions.filter((t) => t.voidedAt !== null)).toHaveLength(1);
  });

  it("tên file có ngày xuất", () => {
    expect(backupFileName(new Date(2026, 8, 26, 10).getTime())).toBe("ghi-no-2026-09-26.json");
  });
});

describe("nhập sao lưu", () => {
  it("nhập vào máy mới: người nợ, giao dịch và số dư giống hệt lúc xuất", async () => {
    await seed();
    const exported = await buildBackup();
    const text = JSON.stringify(exported);

    await resetDbForTests(); // "máy mới"
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const preview = await previewBackupImport(parsed.data);
    expect(preview).toMatchObject({ newDebtors: 2, newTransactions: 4, skipped: 0 });
    await applyBackupImport(parsed.data);

    const debtors = await listDebtors();
    const balances = Object.fromEntries(debtors.map((d) => [d.name, d.balance]));
    expect(balances).toEqual({ "Chị Lan": 100000, "Cô Ba": 1200000 });

    const original = new Map(exported.transactions.map((t) => [t.id, t]));
    for (const t of await getDb().transactions.toArray()) {
      const o = original.get(t.id)!;
      expect(t.createdAt).toBe(o.createdAt);
      expect(t.source).toBe(o.source);
      expect(t.voidedAt).toBe(o.voidedAt);
    }
  });

  it("nhập lại cùng file không nhân đôi, số dư không đổi", async () => {
    await seed();
    const parsed = parseBackup(JSON.stringify(await buildBackup()));
    if (!parsed.ok) throw new Error("parse failed");

    const preview = await previewBackupImport(parsed.data);
    expect(preview).toMatchObject({ newDebtors: 0, newTransactions: 0, skipped: 6 });
    await applyBackupImport(parsed.data);

    expect(await getDb().transactions.count()).toBe(4);
    const lan = (await listDebtors()).find((d) => d.name === "Chị Lan");
    expect(lan?.balance).toBe(100000);
  });

  it("file hỏng hoặc sai định dạng bị từ chối", () => {
    expect(parseBackup("not json")).toEqual({ ok: false, error: "invalid_json" });
    expect(parseBackup(JSON.stringify({ hello: 1 }))).toEqual({ ok: false, error: "wrong_format" });
    expect(parseBackup(JSON.stringify({ format: "ghi-no-backup", version: 99 }))).toEqual({
      ok: false,
      error: "unsupported_version",
    });
    expect(
      parseBackup(
        JSON.stringify({
          format: "ghi-no-backup",
          version: 1,
          debtors: [],
          transactions: [{ id: "x", debtorId: "y", amount: -1, kind: "add", createdAt: 1 }],
        }),
      ),
    ).toEqual({ ok: false, error: "invalid_data" });
  });

  it("giao dịch trỏ tới người không tồn tại thì không ghi gì", async () => {
    const parsed = parseBackup(
      JSON.stringify({
        format: "ghi-no-backup",
        version: 1,
        debtors: [],
        transactions: [{ id: "x", debtorId: "missing", amount: 1000, kind: "add", createdAt: 1 }],
      }),
    );
    if (!parsed.ok) throw new Error("parse failed");
    await expect(applyBackupImport(parsed.data)).rejects.toThrow("orphan_transactions");
    expect(await getDb().transactions.count()).toBe(0);
  });
});

describe("nhắc sao lưu", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 8, 26);

  it("nhắc khi sao lưu cách đây 8 ngày và có giao dịch mới sau đó", () => {
    expect(needsBackupReminder({ lastBackupAt: now - 8 * day, firstTxAt: now - 30 * day, lastTxAt: now - day }, now)).toBe(true);
  });
  it("không nhắc khi chưa có giao dịch mới kể từ lần sao lưu", () => {
    expect(needsBackupReminder({ lastBackupAt: now - 8 * day, firstTxAt: now - 30 * day, lastTxAt: now - 9 * day }, now)).toBe(false);
  });
  it("không nhắc khi chưa đủ 7 ngày", () => {
    expect(needsBackupReminder({ lastBackupAt: now - 3 * day, firstTxAt: now - 30 * day, lastTxAt: now - day }, now)).toBe(false);
  });
  it("chưa sao lưu lần nào: tính từ giao dịch đầu tiên", () => {
    expect(needsBackupReminder({ lastBackupAt: null, firstTxAt: now - BACKUP_REMINDER_MS - 1, lastTxAt: now }, now)).toBe(true);
    expect(needsBackupReminder({ lastBackupAt: null, firstTxAt: now - day, lastTxAt: now }, now)).toBe(false);
    expect(needsBackupReminder({ lastBackupAt: null, firstTxAt: null, lastTxAt: null }, now)).toBe(false);
  });
  it("đọc trạng thái từ DB", async () => {
    await seed();
    await markBackedUp(123);
    const s = await getBackupState();
    expect(s.lastBackupAt).toBe(123);
    expect(s.firstTxAt).toBeLessThanOrEqual(s.lastTxAt!);
  });
});

describe("sao lưu bản 2: lịch sử sửa và trạng thái xoá", () => {
  const DAY = 24 * 60 * 60 * 1000;

  async function seedLifecycle() {
    const t0 = Date.now() - 40 * DAY;
    const tu = (await addDebt({ target: { newDebtor: { name: "Anh Tu" } }, amount: 150000 })).debtor;
    await editDebtor(tu.id, { name: "Anh Tú", note: "cá" });
    await deleteDebtor(tu.id, t0);
    await purgeDebtor(tu.id, t0 + 20 * DAY);
    const ba = (await addDebt({ target: { newDebtor: { name: "Cô Ba" } }, amount: 1000 })).debtor;
    await deleteDebtor(ba.id);
    return { tu, ba };
  }

  it("file xuất có người đã xoá hẳn, đủ giao dịch và lịch sử sửa", async () => {
    const { tu } = await seedLifecycle();
    const file = await buildBackup();
    const exportedTu = file.debtors.find((d) => d.id === tu.id);
    expect(exportedTu?.purgedAt).not.toBeNull();
    expect(exportedTu?.deletedAt).not.toBeNull();
    expect(file.transactions.filter((t) => t.debtorId === tu.id)).toHaveLength(1);
    expect(file.debtorEvents.filter((e) => e.debtorId === tu.id).map((e) => e.kind).sort()).toEqual([
      "delete",
      "edit",
      "purge",
    ]);
  });

  it("nhập vào máy trống ra dữ liệu giống hệt; nhập lại không nhân đôi sự kiện", async () => {
    const { tu, ba } = await seedLifecycle();
    const text = JSON.stringify(await buildBackup());
    const eventCount = (await getDb().debtorEvents.count());

    await resetDbForTests();
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    await applyBackupImport(parsed.data);

    expect(await listDebtors()).toEqual([]);
    expect((await listTrash()).map((d) => d.id)).toEqual([ba.id]);
    const restoredTu = await getDb().debtors.get(tu.id);
    expect(restoredTu).toMatchObject({ name: "Anh Tú", note: "cá", balance: 150000 });
    expect(restoredTu?.purgedAt).not.toBeNull();
    expect(await getDebtorEvents(tu.id)).toHaveLength(3);

    await applyBackupImport(parsed.data);
    expect(await getDb().debtorEvents.count()).toBe(eventCount);
  });

  it("nhập file bản 1: người nợ và giao dịch đầy đủ, tất cả chưa xoá", async () => {
    await seed();
    const v2 = await buildBackup();
    // Dựng lại đúng dạng file bản 1: không có lịch sử sửa, người nợ không có trạng thái xoá.
    const v1 = {
      ...v2,
      version: 1,
      debtorEvents: undefined,
      debtors: v2.debtors.map((d) => {
        const rest: Partial<typeof d> = { ...d };
        delete rest.deletedAt;
        delete rest.purgedAt;
        return rest;
      }),
    };

    await resetDbForTests();
    const parsed = parseBackup(JSON.stringify(v1));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await applyBackupImport(parsed.data);

    const debtors = await listDebtors();
    expect(debtors).toHaveLength(2);
    expect(debtors.every((d) => d.deletedAt === null && d.purgedAt === null)).toBe(true);
    expect(await getDb().transactions.count()).toBe(4);
  });

  it("từ chối phiên bản chưa hỗ trợ", () => {
    expect(parseBackup(JSON.stringify({ format: "ghi-no-backup", version: 3, debtors: [], transactions: [] }))).toEqual({
      ok: false,
      error: "unsupported_version",
    });
  });
});
