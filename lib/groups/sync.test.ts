// @vitest-environment node
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type TestClient } from "../../server/test/harness";
import { getDb, setMeta, switchDbForTests } from "../ledger/db";
import { balances, settle } from "../split";
import type { Me } from "../sync/account";
import { addGuest, createGroup, pendingGroupCount, removeMember, saveExpense, saveSettlement } from "./groups";
import { syncGroupsOnce } from "./sync";

let h: Awaited<ReturnType<typeof createHarness>>;

beforeEach(async () => {
  h = await createHarness();
  for (const n of ["A", "A2", "B"]) await Dexie.delete(n);
});
afterEach(() => getDb().close());

interface Device {
  name: string;
  client: TestClient;
  me: Me;
}

let n = 0;
async function signUp() {
  n += 1;
  const phone = `09876543${String(n).padStart(2, "0")}`;
  const email = `g${n}@example.com`;
  const c = h.client();
  await c.post("/api/account/register", { phone, email, password: "123456", confirmPassword: "123456" });
  await c.post("/api/account/verify", { email, otp: h.mailer.lastOtp(email) });
  return phone;
}

async function device(name: string, phone: string): Promise<Device> {
  const client = h.client();
  const res = await client.post("/api/account/login", { phone, password: "123456" });
  const dev = { name, client, me: res.body as Me };
  await on(dev, () => setMeta("accountUserId", dev.me.userId));
  return dev;
}

async function on<T>(dev: Device, fn: () => Promise<T>): Promise<T> {
  switchDbForTests(dev.name);
  return fn();
}
const sync = (dev: Device) => on(dev, () => syncGroupsOnce(dev.client.fetch));

async function snapshot(groupId: string) {
  const d = getDb();
  const members = await d.groupMembers.where("groupId").equals(groupId).sortBy("orderKey");
  const items = await d.expenses.where("groupId").equals(groupId).toArray();
  const byName = new Map(members.map((m) => [m.id, m.name]));
  const transfers = settle(balances(members, items), members).map((t) => `${byName.get(t.from)} → ${byName.get(t.to)}: ${t.amount}`);
  return { members: members.map((m) => m.name), items: items.filter((i) => !i.deletedAt).length, transfers, events: await d.groupEvents.where("groupId").equals(groupId).count() };
}

/** An tạo nhóm "Đà Lạt" lúc offline với khách "Nhà Hùng" (2 suất), mình 2 suất, ghi đúng chuyến đi trong ghi chú. */
async function trip(A: Device) {
  return on(A, async () => {
    const g = await createGroup({ name: "Đà Lạt", selfName: "Nhà T" });
    const t = (await getDb().groupMembers.where("groupId").equals(g).first())!.id;
    const { editMember } = await import("./groups");
    await editMember(t, { weight: 2 });
    const hung = await addGuest(g, { name: "Nhà Hùng", weight: 2 });
    const onlyH = [{ memberId: hung, weight: 2 }];
    const both = [{ memberId: t, weight: 2 }, { memberId: hung, weight: 2 }];
    await saveExpense({ groupId: g, title: "Bún đậu", amount: 54_000, payerMemberId: t, shares: onlyH });
    await saveExpense({ groupId: g, title: "Kem dừa", amount: 80_000, payerMemberId: t, shares: onlyH });
    await saveExpense({ groupId: g, title: "Cá", amount: 90_000, payerMemberId: t, shares: onlyH });
    await saveExpense({ groupId: g, title: "Lẩu + nước", amount: 700_000, payerMemberId: hung, shares: both });
    const vit = await saveExpense({ groupId: g, title: "Vịt", amount: 180_000, payerMemberId: hung, shares: both });
    return { g, t, hung, vit, both };
  });
}

async function joinAs(dev: Device, groupId: string, memberId: string, inviter: Device) {
  const token = (await inviter.client.post(`/api/groups/${groupId}/invite`)).body.token;
  return dev.client.post("/api/groups/join", { token, memberId });
}

describe("đồng bộ nhóm giữa các thành viên", () => {
  it("tạo offline, lên server, Hùng nhận vị trí khách và thấy đúng kết quả 216.000", async () => {
    const A = await device("A", await signUp());
    const { g, hung } = await trip(A);
    await sync(A);
    expect(await on(A, pendingGroupCount)).toBe(0);

    const B = await device("B", await signUp());
    expect((await joinAs(B, g, hung, A)).status).toBe(200);
    await sync(B);
    const b = await on(B, () => snapshot(g));
    expect(b.transfers).toEqual(["Nhà T → Nhà Hùng: 216000"]);
    expect(b.items).toBe(5);
    await sync(A);
    expect(await on(A, () => snapshot(g))).toEqual(b);
    // Máy B biết vị trí nào là của mình
    expect(await on(B, async () => (await getDb().groupMembers.get(hung))?.userId)).toBe(B.me.userId);
  });

  it("hai người cùng ghi khi offline: sau đồng bộ cả hai có đủ món và cùng kết quả", async () => {
    const A = await device("A", await signUp());
    const { g, t, hung, both } = await trip(A);
    await sync(A);
    const B = await device("B", await signUp());
    await joinAs(B, g, hung, A);
    await sync(B);

    await on(A, () => saveExpense({ groupId: g, title: "Cà phê", amount: 60_000, payerMemberId: t, shares: both }));
    await on(B, () => saveExpense({ groupId: g, title: "Xăng", amount: 100_000, payerMemberId: hung, shares: both }));
    await sync(A);
    await sync(B);
    await sync(A);
    const a = await on(A, () => snapshot(g));
    expect(a.items).toBe(7);
    expect(await on(B, () => snapshot(g))).toEqual(a);
  });

  it("sửa chồng nhau: bản tới server sau thắng, lịch sử có cả hai lần sửa", async () => {
    const A = await device("A", await signUp());
    const { g, hung, vit, both } = await trip(A);
    await sync(A);
    const B = await device("B", await signUp());
    await joinAs(B, g, hung, A);
    await sync(B);

    const edit = (amount: number) => saveExpense({ id: vit, groupId: g, title: "Vịt", amount, payerMemberId: hung, shares: both });
    await on(A, () => edit(200_000));
    await on(B, () => edit(190_000));
    await sync(A);
    await sync(B);
    await sync(A);
    for (const dev of [A, B]) {
      await on(dev, async () => {
        expect((await getDb().expenses.get(vit))?.amount).toBe(190_000);
        const edits = (await getDb().groupEvents.where("entityId").equals(vit).toArray()).filter((e) => e.kind === "edit");
        expect(edits.map((e) => (e.after as { amount: number }).amount).sort()).toEqual([190_000, 200_000]);
      });
    }
  });

  it("máy xoá khách trong khi máy khác vừa cho khách đó vào món: server từ chối, máy nhận lại khách", async () => {
    const phone = await signUp();
    const A = await device("A", phone);
    const A2 = await device("A2", phone);
    const { g, t } = await trip(A);
    const minh = await on(A, () => addGuest(g, { name: "Minh" }));
    await sync(A);
    await sync(A2);

    await on(A2, () => removeMember(minh));
    await on(A, () => saveExpense({ groupId: g, title: "Nước", amount: 20_000, payerMemberId: t, shares: [{ memberId: minh, weight: 1 }] }));
    await sync(A);
    const res = await sync(A2);
    expect(res.rejected).toEqual([{ table: "members", id: minh, reason: "member_in_use" }]);
    await sync(A2);
    expect(await on(A2, async () => (await getDb().groupMembers.get(minh))?.removedAt)).toBeNull();
    expect(await on(A2, pendingGroupCount)).toBe(0);
  });

  it("rời nhóm: nhóm biến khỏi máy người rời", async () => {
    const A = await device("A", await signUp());
    const { g, t, hung } = await trip(A);
    await sync(A);
    const B = await device("B", await signUp());
    await joinAs(B, g, hung, A);
    await sync(B);
    await on(B, () => saveSettlement({ groupId: g, from: t, to: hung, amount: 216_000 }));
    await sync(B);
    // Hùng đang được nhận 216.000 → đã trả rồi thì về 0: nhưng người trả là Nhà T; ghi hộ vẫn được.
    expect((await B.client.post(`/api/groups/${g}/leave`)).status).toBe(200);
    await sync(B);
    expect(await on(B, () => getDb().groups.count())).toBe(0);
    expect(await on(B, () => getDb().expenses.count())).toBe(0);
  });
});
