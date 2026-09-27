// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupRows, GroupSyncResponse, WireExpense, WireGroup, WireGroupEvent, WireMember } from "../lib/groups/wire.js";
import { queryRows } from "./db/client.js";
import * as schema from "./db/schema.js";
import { emptyRows, PULL_LIMIT } from "./groups-sync.js";
import { createHarness, type TestClient } from "./test/harness.js";

const DAY = 24 * 60 * 60 * 1000;
let h: Awaited<ReturnType<typeof createHarness>>;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => vi.useRealTimers());

let n = 0;
async function account() {
  n += 1;
  const phone = `09123456${String(n).padStart(2, "0")}`;
  const email = `u${n}@example.com`;
  const c = h.client();
  await c.post("/api/account/register", { phone, email, password: "123456", confirmPassword: "123456" });
  await c.post("/api/account/verify", { email, otp: h.mailer.lastOtp(email) });
  const me = await c.get("/api/account/me");
  return { c, userId: me.body.userId as string };
}

async function gsync(c: TestClient, push: Partial<GroupRows> = {}, cursors: Record<string, number> = {}) {
  const res = await c.post("/api/groups/sync", { cursors, push: { ...emptyRows(), ...push } });
  return res as { status: number; body: GroupSyncResponse };
}

let clock = 1_700_000_000_000;
const id = () => crypto.randomUUID();
const tick = () => (clock += 1);
const group = (p: Partial<WireGroup> = {}): WireGroup => ({ id: id(), name: "Đà Lạt", createdAt: tick(), updatedAt: clock, deletedAt: null, ...p });
const member = (groupId: string, name: string, p: Partial<WireMember> = {}): WireMember => ({
  id: id(), groupId, name, searchKey: name.toLowerCase(), weight: 1, userId: null, orderKey: tick(), createdAt: clock, updatedAt: clock, removedAt: null, ...p,
});
const expense = (groupId: string, payer: string, amount: number, shares: string[], p: Partial<WireExpense> = {}): WireExpense => ({
  id: id(), groupId, kind: "expense", title: "Lẩu", amount, payerMemberId: payer, toMemberId: null,
  shares: shares.map((memberId) => ({ memberId, weight: 1 })), occurredAt: tick(), createdAt: clock, updatedAt: clock, deletedAt: null, ...p,
});
const event = (groupId: string, entityId: string, p: Partial<WireGroupEvent> = {}): WireGroupEvent => ({
  id: id(), groupId, entity: "expense", entityId, kind: "create", before: null, after: { amount: 1 }, at: tick(), deviceId: "dev", ...p,
});

/** A tạo nhóm có A và khách Hùng. */
async function setup() {
  const a = await account();
  const g = group();
  const ma = member(g.id, "An", { userId: a.userId });
  const mh = member(g.id, "Hùng");
  const res = await gsync(a.c, { groups: [g], members: [ma, mh] });
  expect(res.body.rejected).toEqual([]);
  return { a, g, ma, mh, cursor: res.body.cursors[g.id] };
}

async function invite(c: TestClient, groupId: string) {
  return (await c.post(`/api/groups/${groupId}/invite`)).body.token as string;
}

describe("schema", () => {
  it("migration tạo đủ bảng nhóm", async () => {
    const rows = await queryRows<{ table_name: string }>(
      h.db,
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_name like 'group%' or table_name = 'expenses' order by 1`,
    );
    expect(rows.map((r) => r.table_name)).toEqual(["expenses", "group_events", "group_invites", "group_members", "groups"]);
  });
});

describe("đồng bộ nhóm", () => {
  it("không đăng nhập thì 401", async () => {
    expect((await gsync(h.client())).status).toBe(401);
  });

  it("tạo nhóm: server gắn người tạo và thành viên đầu tiên là chính mình; khách vẫn là khách", async () => {
    const { a, g, ma, mh } = await setup();
    const all = await gsync(a.c);
    expect(all.body.groups).toEqual([g.id]);
    expect(all.body.pull.groups[0].createdByUserId).toBe(a.userId);
    const byId = new Map(all.body.pull.members.map((m) => [m.id, m]));
    expect(byId.get(ma.id)?.userId).toBe(a.userId);
    expect(byId.get(mh.id)?.userId).toBeNull();
  });

  it("máy không tự gắn tài khoản cho người khác hay cho nhóm có sẵn", async () => {
    const { a, g } = await setup();
    const b = await account();
    const fake = member(g.id, "Giả", { userId: b.userId });
    await gsync(a.c, { members: [fake] });
    const all = await gsync(a.c);
    expect(all.body.pull.members.find((m) => m.id === fake.id)?.userId).toBeNull();
  });

  it("người ngoài nhóm: bị từ chối ghi và không kéo được gì", async () => {
    const { g, ma } = await setup();
    const b = await account();
    const e = expense(g.id, ma.id, 1000, [ma.id]);
    const res = await gsync(b.c, { groups: [{ ...g, name: "Chiếm" }], expenses: [e], events: [event(g.id, e.id)] }, { [g.id]: 0 });
    expect(res.body.rejected.map((r) => [r.table, r.reason])).toEqual([
      ["groups", "forbidden"],
      ["expenses", "forbidden"],
      ["events", "forbidden"],
    ]);
    expect(res.body.pull).toEqual(emptyRows());
    expect(res.body.revoked).toEqual([g.id]);
  });

  it("món tham chiếu thành viên của nhóm khác thì invalid; dữ liệu sai dạng thì invalid", async () => {
    const { a, g, ma } = await setup();
    const other = await setup();
    const bad = expense(g.id, ma.id, 1000, [other.ma.id]);
    const res = await gsync(a.c, {
      expenses: [bad, expense(g.id, ma.id, 0, [ma.id]), expense(g.id, ma.id, 1000, [])],
      members: [member(g.id, "X", { weight: 21 })],
    });
    expect(res.body.rejected.map((r) => r.reason)).toEqual(["invalid", "invalid", "invalid", "invalid"]);
  });

  it("sửa món: bản tới sau thắng, lịch sử giữ đủ, người sửa được ghi nhận", async () => {
    const { a, g, ma, mh, cursor } = await setup();
    const vit = expense(g.id, mh.id, 180_000, [ma.id, mh.id], { title: "Vịt" });
    await gsync(a.c, { expenses: [vit], events: [event(g.id, vit.id)] });
    await gsync(a.c, { expenses: [{ ...vit, amount: 200_000, updatedAt: tick() }], events: [event(g.id, vit.id, { kind: "edit" })] });
    await gsync(a.c, { expenses: [{ ...vit, amount: 190_000, updatedAt: tick() }], events: [event(g.id, vit.id, { kind: "edit" })] });
    const res = await gsync(a.c, {}, { [g.id]: cursor });
    expect(res.body.pull.expenses).toHaveLength(1);
    expect(res.body.pull.expenses[0].amount).toBe(190_000);
    expect(res.body.pull.events).toHaveLength(3);
    expect(res.body.pull.events.every((e) => e.userId === a.userId && e.actorMemberId === ma.id)).toBe(true);
    // Đẩy lại y nguyên không tạo dòng mới.
    const again = await gsync(a.c, { expenses: [res.body.pull.expenses[0]] }, res.body.cursors);
    expect(again.body.pull).toEqual(emptyRows());
  });

  it("xoá thành viên: được với khách chưa dính món; từ chối người đã dính món hoặc đã có tài khoản", async () => {
    const { a, g, ma, mh } = await setup();
    const minh = member(g.id, "Minh");
    await gsync(a.c, { members: [minh], expenses: [expense(g.id, mh.id, 1000, [ma.id], { deletedAt: 5 })] });
    const res = await gsync(a.c, {
      members: [
        { ...minh, removedAt: tick() },
        { ...mh, removedAt: tick() },
        { ...ma, userId: a.userId, removedAt: tick() },
      ],
    });
    expect(res.body.rejected).toEqual([
      { table: "members", id: mh.id, reason: "member_in_use" },
      { table: "members", id: ma.id, reason: "member_in_use" },
    ]);
    const all = new Map((await gsync(a.c)).body.pull.members.map((m) => [m.id, m.removedAt]));
    expect(all.get(minh.id)).not.toBeNull();
    expect(all.get(mh.id)).toBeNull();
    expect(all.get(ma.id)).toBeNull();
  });

  it("tối đa 50 thành viên", async () => {
    const { a, g } = await setup();
    const many = Array.from({ length: 49 }, (_, i) => member(g.id, `K${i}`));
    const res = await gsync(a.c, { members: many });
    expect(res.body.rejected.map((r) => r.reason)).toEqual(["limit"]);
  });

  it("kéo theo trang, con trỏ riêng từng nhóm", async () => {
    const { a, g, ma } = await setup();
    const g2 = await (async () => {
      const x = group({ name: "Ăn tối" });
      const m = member(x.id, "An", { userId: a.userId });
      await gsync(a.c, { groups: [x], members: [m] });
      return { x, m };
    })();
    for (let i = 0; i < 3; i++) {
      const rows = Array.from({ length: 450 }, () => expense(g.id, ma.id, 1000, [ma.id]));
      await gsync(a.c, { expenses: rows });
    }
    await gsync(a.c, { expenses: [expense(g2.x.id, g2.m.id, 5, [g2.m.id])] });

    let cursors: Record<string, number> = {};
    let pages = 0;
    let total = 0;
    for (;;) {
      const res = await gsync(a.c, {}, cursors);
      pages += 1;
      total += res.body.pull.expenses.length;
      expect(res.body.pull.expenses.length + res.body.pull.members.length + res.body.pull.groups.length + res.body.pull.events.length).toBeLessThanOrEqual(PULL_LIMIT);
      cursors = { ...cursors, ...res.body.cursors };
      if (!res.body.hasMore) break;
    }
    expect(pages).toBe(2);
    expect(total).toBe(1351);
    const done = await gsync(a.c, {}, cursors);
    expect(done.body.pull).toEqual(emptyRows());
  });

  it("hai máy đồng bộ song song không làm hụt dòng", async () => {
    const { a, g, ma, cursor } = await setup();
    const b = h.client();
    // Cùng tài khoản trên máy thứ hai
    b["cookies" as never] = a.c["cookies" as never];
    const batches = Array.from({ length: 6 }, () => Array.from({ length: 20 }, () => expense(g.id, ma.id, 1000, [ma.id])));
    let seen = 0;
    let cur = { [g.id]: cursor };
    await Promise.all(
      batches.map(async (rows, i) => {
        await gsync(i % 2 ? a.c : b, { expenses: rows });
        const res = await gsync(a.c, {}, cur);
        seen += res.body.pull.expenses.length;
        cur = { ...cur, ...res.body.cursors };
      }),
    );
    for (;;) {
      const res = await gsync(a.c, {}, cur);
      seen += res.body.pull.expenses.length;
      cur = { ...cur, ...res.body.cursors };
      if (!res.body.hasMore) break;
    }
    // Có thể thấy một dòng hai lần (kéo trùng) nhưng không bao giờ thiếu.
    expect(seen).toBeGreaterThanOrEqual(120);
    const ids = new Set((await gsync(a.c)).body.pull.expenses.map((e) => e.id));
    expect(ids.size).toBe(120);
  });
});

describe("mời và vào nhóm", () => {
  it("mọi thành viên lấy cùng link; người ngoài không lấy được; chỉ người tạo đổi được link", async () => {
    const { a, g } = await setup();
    const t1 = await invite(a.c, g.id);
    expect(t1.length).toBeGreaterThanOrEqual(40);
    expect(await invite(a.c, g.id)).toBe(t1);

    const b = await account();
    expect((await b.c.post(`/api/groups/${g.id}/invite`)).status).toBe(404);
    expect((await b.c.post("/api/groups/join", { token: t1, name: "Bình" })).status).toBe(200);
    expect(await invite(b.c, g.id)).toBe(t1);
    expect((await b.c.post(`/api/groups/${g.id}/invite/reset`)).status).toBe(403);

    const reset = await a.c.post(`/api/groups/${g.id}/invite/reset`);
    expect(reset.body.token).not.toBe(t1);
    const c = await account();
    expect((await c.c.post("/api/groups/join/preview", { token: t1 })).status).toBe(404);
    expect((await c.c.post("/api/groups/join", { token: t1, name: "Chi" })).body.error).toBe("invalid_link");
    // Người đã vào vẫn còn trong nhóm
    expect((await gsync(b.c)).body.groups).toEqual([g.id]);
  });

  it("nhận vị trí khách: tải về đủ nhóm, món cũ vẫn do người đó trả", async () => {
    const { a, g, ma, mh } = await setup();
    const vit = expense(g.id, mh.id, 180_000, [ma.id, mh.id], { title: "Vịt" });
    await gsync(a.c, { expenses: [vit] });
    const token = await invite(a.c, g.id);

    const hung = await account();
    const preview = await hung.c.post("/api/groups/join/preview", { token });
    expect(preview.body).toMatchObject({ groupId: g.id, name: "Đà Lạt", alreadyMember: false });
    expect(preview.body.members).toEqual([
      { id: ma.id, name: "An", weight: 1, linked: true },
      { id: mh.id, name: "Hùng", weight: 1, linked: false },
    ]);
    const join = await hung.c.post("/api/groups/join", { token, memberId: mh.id });
    expect(join.body).toEqual({ groupId: g.id, memberId: mh.id });

    const pulled = await gsync(hung.c);
    expect(pulled.body.pull.expenses.map((e) => e.payerMemberId)).toEqual([mh.id]);
    expect(pulled.body.pull.members.find((m) => m.id === mh.id)?.userId).toBe(hung.userId);
    expect(pulled.body.pull.events.find((e) => e.kind === "claim")?.actorMemberId).toBe(mh.id);

    // Mở lại link khi đã là thành viên: vào thẳng
    expect((await hung.c.post("/api/groups/join/preview", { token })).body.alreadyMember).toBe(true);
    expect((await hung.c.post("/api/groups/join", { token, name: "Khác" })).body.memberId).toBe(mh.id);
  });

  it("hai người cùng nhận một vị trí: chỉ một người được", async () => {
    const { a, g, mh } = await setup();
    const token = await invite(a.c, g.id);
    const [x, y] = [await account(), await account()];
    const res = await Promise.all([x.c.post("/api/groups/join", { token, memberId: mh.id }), y.c.post("/api/groups/join", { token, memberId: mh.id })]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(res.find((r) => r.status === 409)?.body.error).toBe("taken");
  });

  it("vào như người mới: trùng tên thì báo", async () => {
    const { a, g } = await setup();
    const token = await invite(a.c, g.id);
    const b = await account();
    expect((await b.c.post("/api/groups/join", { token, name: "hung" })).body.error).toBe("name_taken");
    const ok = await b.c.post("/api/groups/join", { token, name: "Minh" });
    expect(ok.status).toBe(200);
    const m = (await gsync(b.c)).body.pull.members.find((x) => x.id === ok.body.memberId);
    expect(m).toMatchObject({ name: "Minh", weight: 1, userId: b.userId });
  });

  it("dò link sai quá nhiều lần thì bị chặn", async () => {
    const b = await account();
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await b.c.post("/api/groups/join/preview", { token: "x".repeat(43) })).status;
    expect(last).toBe(429);
  });
});

describe("rời, xoá, khôi phục", () => {
  async function withHung() {
    const s = await setup();
    const token = await invite(s.a.c, s.g.id);
    const hung = await account();
    await hung.c.post("/api/groups/join", { token, memberId: s.mh.id });
    return { ...s, hung };
  }

  it("còn nợ thì không rời được; trả hết rồi rời: thành khách, món giữ nguyên, không nhận món mới", async () => {
    const { a, g, ma, mh, hung } = await withHung();
    await gsync(a.c, { expenses: [expense(g.id, ma.id, 100_000, [ma.id, mh.id])] });
    const refused = await hung.c.post(`/api/groups/${g.id}/leave`);
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ error: "not_settled", balance: -50_000 });

    await gsync(hung.c, { expenses: [{ ...expense(g.id, mh.id, 50_000, []), kind: "settlement", title: "", toMemberId: ma.id, shares: null }] });
    const before = await gsync(hung.c);
    expect((await hung.c.post(`/api/groups/${g.id}/leave`)).status).toBe(200);

    await gsync(a.c, { expenses: [expense(g.id, ma.id, 1000, [ma.id])] });
    const after = await gsync(hung.c, {}, before.body.cursors);
    expect(after.body.revoked).toEqual([g.id]);
    expect(after.body.pull).toEqual(emptyRows());
    const seenByA = (await gsync(a.c)).body.pull.members.find((m) => m.id === mh.id);
    expect(seenByA).toMatchObject({ name: "Hùng", userId: null, removedAt: null });
  });

  it("chỉ người tạo xoá/khôi phục; ngày 29 còn khôi phục được, sau 30 ngày nhóm ẩn hẳn nhưng còn trong DB", async () => {
    const { a, g, hung } = await withHung();
    expect((await hung.c.post(`/api/groups/${g.id}/delete`)).status).toBe(403);
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = Date.now();
    expect((await a.c.post(`/api/groups/${g.id}/delete`)).status).toBe(200);
    const del = await gsync(hung.c);
    expect(del.body.pull.groups[0].deletedAt).not.toBeNull();

    vi.setSystemTime(t0 + 29 * DAY);
    expect((await a.c.post(`/api/groups/${g.id}/restore`)).status).toBe(200);
    expect((await gsync(hung.c)).body.pull.groups[0].deletedAt).toBeNull();

    await a.c.post(`/api/groups/${g.id}/delete`);
    vi.setSystemTime(t0 + 29 * DAY + 31 * DAY);
    const gone = await gsync(a.c, {}, { [g.id]: 0 });
    expect(gone.body.revoked).toEqual([g.id]);
    expect(gone.body.groups).toEqual([]);
    expect((await gsync(hung.c, {}, { [g.id]: 0 })).body.revoked).toEqual([g.id]);
    const [row] = await h.db.select().from(schema.groups);
    expect(row.purgedAt).not.toBeNull();
    expect((await a.c.post(`/api/groups/${g.id}/restore`)).status).toBe(404);
  });
});
