// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncDebtor, SyncEvent, SyncResponse, SyncRows, SyncTransaction } from "./sync.js";
import { createHarness, type TestClient } from "./test/harness.js";

const DAY = 24 * 60 * 60 * 1000;
let h: Awaited<ReturnType<typeof createHarness>>;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => vi.useRealTimers());

async function account(phone = "0912345678", email = "lan@example.com") {
  const a = h.client();
  await a.post("/api/account/register", { phone, email, password: "123456", confirmPassword: "123456" });
  const v = await a.post("/api/account/verify", { email, otp: h.mailer.lastOtp(email) });
  const b = h.client();
  await b.post("/api/account/login", { phone, password: "123456" });
  return { a, b, bookId: v.body.bookId as string };
}

const empty = (): SyncRows => ({ debtors: [], transactions: [], debtorEvents: [] });
async function sync(c: TestClient, push: Partial<SyncRows> = {}, cursor = 0) {
  const res = await c.post("/api/sync", { cursor, push: { ...empty(), ...push } });
  return res as { status: number; body: SyncResponse };
}

let clock = 1_700_000_000_000;
const id = () => crypto.randomUUID();
function debtor(p: Partial<SyncDebtor> = {}): SyncDebtor {
  clock += 1;
  return { id: id(), bookId: id(), name: "Chị Lan", note: "", searchKey: "chi lan", createdAt: clock, updatedAt: clock, deletedAt: null, purgedAt: null, ...p };
}
function tx(debtorId: string, p: Partial<SyncTransaction> = {}): SyncTransaction {
  clock += 1;
  return { id: id(), bookId: id(), debtorId, amount: 50000, kind: "add", direction: "they_owe", occurredAt: clock, createdAt: clock, updatedAt: clock, voidedAt: null, source: "manual", note: "", deviceId: "dev-a", ...p };
}
function ev(debtorId: string, p: Partial<SyncEvent> = {}): SyncEvent {
  clock += 1;
  return { id: id(), bookId: id(), debtorId, kind: "edit", before: { name: "A", note: "" }, after: { name: "B", note: "" }, at: clock, deviceId: "dev-a", ...p };
}

describe("đẩy", () => {
  it("không đăng nhập thì 401", async () => {
    expect((await sync(h.client())).status).toBe(401);
  });

  it("gán sổ theo phiên (bỏ qua bookId máy gửi); đẩy lại cùng dữ liệu không nhân đôi", async () => {
    const { a, bookId } = await account();
    const lan = debtor();
    const t = tx(lan.id);
    const e = ev(lan.id);
    const first = await sync(a, { debtors: [lan], transactions: [t], debtorEvents: [e] });
    expect(first.body.rejected).toEqual([]);
    expect(first.body.pull.debtors[0].bookId).toBe(bookId);
    expect(first.body.pull.transactions).toHaveLength(1);

    const again = await sync(a, { debtors: [lan], transactions: [t], debtorEvents: [e] }, first.body.cursor);
    expect(again.body.pull).toEqual(empty());
    const all = await sync(a);
    expect(all.body.pull.transactions).toHaveLength(1);
    expect(all.body.pull.debtorEvents).toHaveLength(1);
  });

  it("đã hủy ở một máy thì hủy ở mọi máy; không bỏ hủy được", async () => {
    const { a, b } = await account();
    const lan = debtor();
    const t = tx(lan.id);
    await sync(a, { debtors: [lan], transactions: [t] });
    await sync(b, { transactions: [{ ...t, voidedAt: clock + 5, updatedAt: clock + 5 }] });
    await sync(a, { transactions: [{ ...t, voidedAt: null }] });
    const view = await sync(a);
    expect(view.body.pull.transactions[0].voidedAt).toBe(clock + 5);
  });

  it("hai lần đổi tên: bản tới sau thắng, cả hai sự kiện còn", async () => {
    const { a, b } = await account();
    const lan = debtor({ name: "Chi Lan", searchKey: "chi lan" });
    await sync(a, { debtors: [lan] });
    await sync(a, { debtors: [{ ...lan, name: "Chị Lan rau", searchKey: "chi lan rau" }], debtorEvents: [ev(lan.id)] });
    await sync(b, { debtors: [{ ...lan, name: "Lan cá", searchKey: "lan ca" }], debtorEvents: [ev(lan.id)] });
    const view = await sync(a);
    expect(view.body.pull.debtors[0].name).toBe("Lan cá");
    expect(view.body.pull.debtorEvents).toHaveLength(2);
  });

  it("id thuộc sổ người khác bị từ chối và sổ kia không đổi", async () => {
    const lan = await account("0912345678", "lan@example.com");
    const tu = await account("0987654321", "tu@example.com");
    const d = debtor({ name: "Của Lan" });
    await sync(lan.a, { debtors: [d] });
    const attack = await sync(tu.a, { debtors: [{ ...d, name: "Bị sửa" }], transactions: [tx(d.id)] });
    expect(attack.body.rejected).toEqual(
      expect.arrayContaining([
        { table: "debtors", id: d.id, reason: "foreign" },
        expect.objectContaining({ table: "transactions", reason: "orphan" }),
      ]),
    );
    expect(attack.body.pull.debtors).toEqual([]);
    expect((await sync(lan.a)).body.pull.debtors[0].name).toBe("Của Lan");
  });

  it("dữ liệu sai bị từ chối từng dòng, dòng đúng vẫn ghi", async () => {
    const { a } = await account();
    const lan = debtor();
    const res = await sync(a, { debtors: [lan], transactions: [tx(lan.id, { amount: -5 }), tx(lan.id)] });
    expect(res.body.rejected).toEqual([expect.objectContaining({ table: "transactions", reason: "invalid" })]);
    expect(res.body.pull.transactions).toHaveLength(1);
  });

  it("quá 500 dòng một lần thì 413", async () => {
    const { a } = await account();
    const many = Array.from({ length: 501 }, () => debtor());
    expect((await sync(a, { debtors: many })).status).toBe(413);
  });
});

describe("kéo", () => {
  it("hai máy đẩy/kéo xen kẽ ra cùng dữ liệu", async () => {
    const { a, b } = await account();
    const lan = debtor();
    let ca = 0;
    let cb = 0;
    ca = (await sync(a, { debtors: [lan], transactions: [tx(lan.id, { amount: 100000 })] }, ca)).body.cursor;
    const rb = await sync(b, { transactions: [tx(lan.id, { amount: 30000, deviceId: "b" })] }, cb);
    cb = rb.body.cursor;
    expect(rb.body.pull.transactions).toHaveLength(2);
    const ra = await sync(a, { transactions: [tx(lan.id, { kind: "pay", amount: 10000 })] }, ca);
    expect(ra.body.pull.transactions).toHaveLength(2); // của B + của chính nó
    const rb2 = await sync(b, {}, cb);
    expect(rb2.body.pull.transactions).toHaveLength(1);
    const sum = (rows: SyncTransaction[]) => rows.reduce((s, t) => s + (t.kind === "add" ? t.amount : -t.amount), 0);
    expect(sum((await sync(a)).body.pull.transactions)).toBe(120000);
    expect(sum((await sync(b)).body.pull.transactions)).toBe(120000);
  });

  it("2500 dòng kéo đủ qua 3 trang", async () => {
    const { a, b } = await account();
    const lan = debtor();
    await sync(a, { debtors: [lan] });
    for (let i = 0; i < 5; i++) {
      await sync(a, { transactions: Array.from({ length: 500 }, () => tx(lan.id)) });
    }
    let cursor = 0;
    let pages = 0;
    let total = 0;
    for (;;) {
      const r = await sync(b, {}, cursor);
      pages++;
      total += r.body.pull.transactions.length + r.body.pull.debtors.length;
      cursor = r.body.cursor;
      if (!r.body.hasMore) break;
    }
    expect(total).toBe(2501);
    expect(pages).toBe(3);
  });
});

describe("thùng rác theo giờ server", () => {
  async function deletedOnServerAt(a: TestClient, at: number) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);
    const tu = debtor({ name: "Anh Tú", searchKey: "anh tu" });
    await sync(a, { debtors: [tu] });
    // Đồng hồ máy báo đã xoá từ 40 ngày trước — server vẫn tính từ lúc nó nhận thao tác xoá.
    await sync(a, { debtors: [{ ...tu, deletedAt: at - 40 * DAY }] });
    return tu;
  }

  it("ngày 14: từ chối xoá hẳn và trả lại trạng thái đúng; ngày 16: nhận", async () => {
    const { a } = await account();
    const t0 = Date.now();
    const tu = await deletedOnServerAt(a, t0);
    const deleted = { ...tu, deletedAt: t0 - 40 * DAY };

    vi.setSystemTime(t0 + 14 * DAY);
    const early = await sync(a, { debtors: [{ ...deleted, purgedAt: t0 + 14 * DAY }] }, 999_999);
    expect(early.body.rejected).toEqual([{ table: "debtors", id: tu.id, reason: "purge_too_early" }]);
    expect((await sync(a)).body.pull.debtors[0].purgedAt).toBeNull();

    vi.setSystemTime(t0 + 16 * DAY);
    const ok = await sync(a, { debtors: [{ ...deleted, purgedAt: t0 + 16 * DAY }] });
    expect(ok.body.rejected).toEqual([]);
    expect(ok.body.pull.debtors[0].purgedAt).toBe(t0 + 16 * DAY);
  });

  it("đủ 30 ngày theo giờ server thì tự xoá hẳn; máy không bỏ được xoá hẳn", async () => {
    const { a } = await account();
    const t0 = Date.now();
    const tu = await deletedOnServerAt(a, t0);

    vi.setSystemTime(t0 + 29 * DAY);
    expect((await sync(a)).body.pull.debtors[0].purgedAt).toBeNull();
    vi.setSystemTime(t0 + 31 * DAY);
    expect((await sync(a)).body.pull.debtors[0].purgedAt).toBe(t0 + 31 * DAY);

    await sync(a, { debtors: [{ ...tu, deletedAt: null, purgedAt: null, name: "Khôi phục lậu" }] });
    const view = (await sync(a)).body.pull.debtors[0];
    expect(view.purgedAt).toBe(t0 + 31 * DAY);
    expect(view.name).toBe("Anh Tú");
  });

  it("dòng mới lên server đã xoá hẳn sẵn trên máy (làm lúc chưa đăng nhập) được giữ nguyên", async () => {
    const { a } = await account();
    const old = debtor({ deletedAt: clock - 20 * DAY, purgedAt: clock - 2 * DAY });
    const res = await sync(a, { debtors: [old] });
    expect(res.body.rejected).toEqual([]);
    expect(res.body.pull.debtors[0].purgedAt).toBe(old.purgedAt);
  });
});
