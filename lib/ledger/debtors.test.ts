import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "./db";
import {
  AUTO_PURGE_MS,
  deleteDebtor,
  editDebtor,
  getDebtorEvents,
  listTrash,
  purgeDebtor,
  purgeExpired,
  PURGE_ALLOWED_MS,
  restoreDebtor,
  trashState,
} from "./debtors";
import { addDebt, getDebtor, getHistory, importBatch, LedgerError, listDebtors, payDebt } from "./ledger";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

beforeEach(async () => {
  await resetDbForTests();
});

async function newDebtor(name: string, amount = 150000) {
  return (await addDebt({ target: { newDebtor: { name } }, amount })).debtor;
}

describe("trashState", () => {
  const t0 = 1_000_000;
  it("chưa đủ 15 ngày thì chưa được xoá hẳn", () => {
    expect(trashState(t0, t0 + 14 * DAY + 23 * HOUR).canPurge).toBe(false);
  });
  it("đủ 15 ngày thì được xoá hẳn", () => {
    const s = trashState(t0, t0 + 15 * DAY);
    expect(s.canPurge).toBe(true);
    expect(s.purgeAllowedAt).toBe(t0 + PURGE_ALLOWED_MS);
  });
  it("ngày 29 còn 1 ngày, ngày 30 tới hạn tự xoá", () => {
    expect(trashState(t0, t0 + 29 * DAY).daysLeft).toBe(1);
    const s = trashState(t0, t0 + 30 * DAY);
    expect(s.daysLeft).toBe(0);
    expect(s.autoPurgeAt).toBe(t0 + AUTO_PURGE_MS);
  });
});

describe("sửa người nợ", () => {
  it("đổi tên cập nhật khóa tìm kiếm, ghi sự kiện, giữ số dư", async () => {
    const lan = await newDebtor("Chi Lan");
    const edited = await editDebtor(lan.id, { name: "  Chị Lan   rau ", note: "" });
    expect(edited.name).toBe("Chị Lan rau");
    expect(edited.searchKey).toBe("chi lan rau");
    expect(edited.balance).toBe(150000);
    const events = await getDebtorEvents(lan.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "edit",
      before: { name: "Chi Lan", note: "" },
      after: { name: "Chị Lan rau", note: "" },
    });
    expect(events[0].deviceId).toBeTypeOf("string");
  });

  it("đổi ghi chú", async () => {
    const lan = await newDebtor("Chị Lan");
    await editDebtor(lan.id, { name: "Chị Lan", note: "cá" });
    expect((await getDebtor(lan.id))?.note).toBe("cá");
    expect(await getDebtorEvents(lan.id)).toHaveLength(1);
  });

  it("tên trống bị từ chối", async () => {
    const lan = await newDebtor("Chị Lan");
    await expect(editDebtor(lan.id, { name: "   ", note: "" })).rejects.toMatchObject({ code: "invalid_name" });
    expect((await getDebtor(lan.id))?.name).toBe("Chị Lan");
  });

  it("lưu mà không đổi gì thì không ghi sự kiện", async () => {
    const lan = await newDebtor("Chị Lan");
    await editDebtor(lan.id, { name: "Chị Lan ", note: "" });
    expect(await getDebtorEvents(lan.id)).toHaveLength(0);
  });
});

describe("thùng rác", () => {
  it("xoá → khôi phục → xoá → xoá hẳn; dữ liệu vẫn còn", async () => {
    const t0 = Date.now();
    const tu = await newDebtor("Anh Tú");
    await payDebt({ target: { debtorId: tu.id }, amount: 50000 });

    await deleteDebtor(tu.id, t0);
    expect(await listDebtors()).toEqual([]);
    expect((await listTrash()).map((d) => d.id)).toEqual([tu.id]);

    await restoreDebtor(tu.id, t0 + DAY);
    expect((await listDebtors()).map((d) => d.balance)).toEqual([100000]);
    expect(await listTrash()).toEqual([]);

    await deleteDebtor(tu.id, t0 + 2 * DAY);
    await expect(purgeDebtor(tu.id, t0 + 16 * DAY)).rejects.toMatchObject({ code: "purge_too_early" });
    await purgeDebtor(tu.id, t0 + 17 * DAY);

    expect(await listTrash()).toEqual([]);
    expect(await getDebtor(tu.id)).toBeUndefined();
    // Không xoá vật lý: người nợ, giao dịch và lịch sử sửa vẫn nằm trong DB.
    expect((await getDb().debtors.get(tu.id))?.purgedAt).toBe(t0 + 17 * DAY);
    expect(await getHistory(tu.id)).toHaveLength(2);
    expect((await getDebtorEvents(tu.id)).map((e) => e.kind)).toEqual(["purge", "delete", "restore", "delete"]);
  });

  it("chặn xoá hẳn ở ngày 14", async () => {
    const t0 = Date.now();
    const tu = await newDebtor("Anh Tú");
    await deleteDebtor(tu.id, t0);
    await expect(purgeDebtor(tu.id, t0 + 14 * DAY)).rejects.toBeInstanceOf(LedgerError);
  });

  it("tự xoá hẳn khi đủ 30 ngày, chưa đủ thì giữ", async () => {
    const t0 = Date.now();
    const a = await newDebtor("Anh Tú");
    const b = await newDebtor("Cô Ba");
    await deleteDebtor(a.id, t0);
    await deleteDebtor(b.id, t0 + 5 * DAY);
    expect(await purgeExpired(t0 + 30 * DAY)).toBe(1);
    expect((await listTrash()).map((d) => d.id)).toEqual([b.id]);
  });

  it("người trong thùng rác không ghi/trừ/sửa được", async () => {
    const tu = await newDebtor("Anh Tú");
    await deleteDebtor(tu.id);
    await expect(addDebt({ target: { debtorId: tu.id }, amount: 1000 })).rejects.toMatchObject({
      code: "debtor_deleted",
    });
    await expect(payDebt({ target: { debtorId: tu.id }, amount: 1000 })).rejects.toMatchObject({
      code: "debtor_deleted",
    });
    await expect(editDebtor(tu.id, { name: "Tú", note: "" })).rejects.toMatchObject({ code: "debtor_deleted" });
  });

  it("gõ tên trùng người trong thùng rác thì tạo người mới", async () => {
    const tu = await newDebtor("Anh Tú");
    await deleteDebtor(tu.id);
    const again = await addDebt({ target: { newDebtor: { name: "anh tú" } }, amount: 50000 });
    expect(again.debtor.id).not.toBe(tu.id);

    const res = await importBatch([{ name: "anh tu", amount: 1000, kind: "add" }], "backup");
    expect(res.ok && res.transactions[0].debtorId).toBe(again.debtor.id);
    expect((await getDb().debtors.get(tu.id))?.deletedAt).not.toBeNull();
  });
});

describe("giờ server khi đã đăng nhập", () => {
  it("đồng hồ máy chạy trước 20 ngày: chưa cho xoá hẳn, chưa tự xoá hẳn", async () => {
    const { setMeta } = await import("./db");
    const tu = await newDebtor("Anh Tú");
    // Máy tưởng đã xoá từ 20 ngày trước, nhưng theo server thì vừa xoá.
    await deleteDebtor(tu.id, Date.now() - 20 * DAY);
    await setMeta("accountUserId", "u1");
    await setMeta("serverOffset", -20 * DAY);
    await expect(purgeDebtor(tu.id)).rejects.toMatchObject({ code: "purge_too_early" });
    expect(await purgeExpired()).toBe(0);

    // Chưa đăng nhập thì chỉ dựa vào giờ máy như trước.
    await setMeta("accountUserId", undefined);
    await expect(purgeDebtor(tu.id)).resolves.toBeTruthy();
  });
});
