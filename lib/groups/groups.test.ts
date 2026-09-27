import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests, setMeta } from "../ledger/db";
import {
  addGuest,
  createGroup,
  deleteExpense,
  dropGroupLocal,
  editMember,
  GroupError,
  pendingGroupCount,
  removeMember,
  renameGroup,
  restoreExpense,
  saveExpense,
  saveSettlement,
  SELF_NAME_META,
  wipeGroups,
} from "./groups";

beforeEach(async () => {
  await resetDbForTests();
  await setMeta("accountUserId", "user-a");
});

const code = (p: Promise<unknown>) => p.then(() => "ok", (e: GroupError) => e.code);

async function members(groupId: string) {
  return (await getDb().groupMembers.where("groupId").equals(groupId).sortBy("orderKey")).filter((m) => !m.removedAt);
}

describe("nhóm và thành viên", () => {
  it("chưa đăng nhập thì không tạo được nhóm", async () => {
    await getDb().meta.delete("accountUserId");
    expect(await code(createGroup({ name: "Đà Lạt", selfName: "An" }))).toBe("not_logged_in");
  });

  it("tạo nhóm: mình là thành viên đầu, 1 suất; nhớ tên đã dùng; mọi dòng chờ đẩy", async () => {
    const g = await createGroup({ name: "  Đà   Lạt ", selfName: "An" });
    const d = getDb();
    expect((await d.groups.get(g))?.name).toBe("Đà Lạt");
    expect(await members(g)).toMatchObject([{ name: "An", weight: 1, userId: "user-a" }]);
    expect((await d.meta.get(SELF_NAME_META))?.value).toBe("An");
    expect(await pendingGroupCount()).toBe(4); // nhóm, thành viên, 2 lịch sử
  });

  it("thêm khách, trùng tên (không dấu) bị chặn, đổi tên và suất có lịch sử", async () => {
    const g = await createGroup({ name: "Đà Lạt", selfName: "An" });
    const h = await addGuest(g, { name: "Nhà Hùng", weight: 2 });
    expect(await code(addGuest(g, { name: "nha hung" }))).toBe("name_taken");
    expect(await code(addGuest(g, { name: "X", weight: 21 }))).toBe("invalid_weight");
    await editMember(h, { weight: 3 });
    const ev = await getDb().groupEvents.where("entityId").equals(h).sortBy("at");
    expect(ev.map((e) => e.kind)).toEqual(["create", "edit"]);
    expect(ev[1]).toMatchObject({ before: { name: "Nhà Hùng", weight: 2 }, after: { name: "Nhà Hùng", weight: 3 } });
  });

  it("tối đa 50 thành viên", async () => {
    const g = await createGroup({ name: "Lớp", selfName: "An" });
    for (let i = 0; i < 49; i++) await addGuest(g, { name: `K${i}` });
    expect(await code(addGuest(g, { name: "Thừa" }))).toBe("too_many_members");
  });

  it("xoá khách chưa dính món được; người đã dính món (kể cả món đã xoá) hoặc có tài khoản thì không", async () => {
    const g = await createGroup({ name: "Đà Lạt", selfName: "An" });
    const [me] = await members(g);
    const minh = await addGuest(g, { name: "Minh" });
    const hung = await addGuest(g, { name: "Hùng" });
    const e = await saveExpense({ groupId: g, title: "Vịt", amount: 180_000, payerMemberId: hung, shares: [{ memberId: me.id, weight: 1 }] });
    await deleteExpense(e);
    expect(await code(removeMember(hung))).toBe("member_in_use");
    expect(await code(removeMember(me.id))).toBe("member_in_use");
    await removeMember(minh);
    expect((await members(g)).map((m) => m.name)).toEqual(["An", "Hùng"]);
  });

  it("đổi đơn vị suất không đổi món cũ (món giữ bản chụp suất)", async () => {
    const g = await createGroup({ name: "Đà Lạt", selfName: "An" });
    const [me] = await members(g);
    const e = await saveExpense({ groupId: g, title: "Lẩu", amount: 700_000, payerMemberId: me.id, shares: [{ memberId: me.id, weight: 1 }] });
    await editMember(me.id, { weight: 3 });
    expect((await getDb().expenses.get(e))?.shares).toEqual([{ memberId: me.id, weight: 1 }]);
  });

  it("đổi tên nhóm có lịch sử", async () => {
    const g = await createGroup({ name: "Đà Lạt", selfName: "An" });
    await renameGroup(g, "Đà Lạt 2026");
    const ev = await getDb().groupEvents.where("entityId").equals(g).sortBy("at");
    expect(ev.at(-1)).toMatchObject({ kind: "edit", before: { name: "Đà Lạt" }, after: { name: "Đà Lạt 2026" } });
  });
});

describe("món và thanh toán", () => {
  it("kiểm tra dữ liệu: số tiền, tên món, người cùng chia, trả cho chính mình", async () => {
    const g = await createGroup({ name: "Đà Lạt", selfName: "An" });
    const [me] = await members(g);
    const base = { groupId: g, title: "Cá", amount: 90_000, payerMemberId: me.id, shares: [{ memberId: me.id, weight: 1 }] };
    expect(await code(saveExpense({ ...base, amount: 0 }))).toBe("invalid_amount");
    expect(await code(saveExpense({ ...base, amount: 1_000_000_001 }))).toBe("invalid_amount");
    expect(await code(saveExpense({ ...base, title: " " }))).toBe("empty_name");
    expect(await code(saveExpense({ ...base, shares: [] }))).toBe("no_participants");
    expect(await code(saveSettlement({ groupId: g, from: me.id, to: me.id, amount: 1 }))).toBe("same_person");
  });

  it("sửa, xoá, khôi phục món đều có lịch sử; sửa y nguyên không ghi gì", async () => {
    const g = await createGroup({ name: "Đà Lạt", selfName: "An" });
    const [me] = await members(g);
    const h = await addGuest(g, { name: "Hùng" });
    const input = { groupId: g, title: "Vịt", amount: 180_000, payerMemberId: h, shares: [{ memberId: me.id, weight: 1 }, { memberId: h, weight: 1 }] };
    const e = await saveExpense(input);
    await saveExpense({ ...input, id: e });
    await saveExpense({ ...input, id: e, amount: 200_000 });
    await deleteExpense(e);
    expect((await getDb().expenses.get(e))?.deletedAt).not.toBeNull();
    await restoreExpense(e);
    expect((await getDb().expenses.get(e))?.deletedAt).toBeNull();
    const ev = await getDb().groupEvents.where("entityId").equals(e).sortBy("at");
    expect(ev.map((x) => x.kind)).toEqual(["create", "edit", "delete", "restore"]);
    expect((ev[1].before as { amount: number }).amount).toBe(180_000);
    expect((ev[1].after as { amount: number }).amount).toBe(200_000);
  });

  it("dòng thanh toán", async () => {
    const g = await createGroup({ name: "Đà Lạt", selfName: "An" });
    const [me] = await members(g);
    const h = await addGuest(g, { name: "Hùng" });
    const s = await saveSettlement({ groupId: g, from: me.id, to: h, amount: 216_000 });
    expect(await getDb().expenses.get(s)).toMatchObject({ kind: "settlement", payerMemberId: me.id, toMemberId: h, shares: null });
  });
});

describe("dọn dữ liệu", () => {
  it("bỏ một nhóm và xoá hết nhóm, sổ nợ không bị đụng", async () => {
    const g1 = await createGroup({ name: "A", selfName: "An" });
    const g2 = await createGroup({ name: "B", selfName: "An" });
    await dropGroupLocal(g1);
    const d = getDb();
    expect((await d.groups.toArray()).map((g) => g.id)).toEqual([g2]);
    expect(await d.groupMembers.where("groupId").equals(g1).count()).toBe(0);
    await wipeGroups();
    expect(await d.groups.count()).toBe(0);
    expect(await pendingGroupCount()).toBe(0);
    expect(await d.books.count()).toBe(1);
  });
});
