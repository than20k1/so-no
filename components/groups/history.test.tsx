import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { GroupData } from "@/lib/groups/view";
import { viewGroup } from "@/lib/groups/view";
import { I18nProvider } from "@/lib/i18n";
import { useGroupsT } from "@/lib/i18n/groups";
import type { GroupEvent } from "@/lib/ledger/types";
import { describeEvent } from "./history";

afterEach(cleanup);

const member = (id: string, name: string, orderKey: number, userId: string | null = null) => ({
  id, groupId: "g", name, searchKey: name, weight: 2, userId, orderKey, createdAt: 1, updatedAt: 1, removedAt: null,
});
const data: GroupData = {
  group: { id: "g", name: "Đà Lạt", createdByUserId: "u-t", createdAt: 1, updatedAt: 1, deletedAt: null },
  members: [member("h", "Nhà Hùng", 2, "u-h"), member("t", "Nhà T", 1, "u-t")],
  items: [
    { id: "e1", groupId: "g", kind: "expense", title: "Bún đậu", amount: 224_000, payerMemberId: "t", toMemberId: null, shares: [{ memberId: "h", weight: 2 }], occurredAt: 2, createdAt: 2, updatedAt: 2, deletedAt: null },
    { id: "e2", groupId: "g", kind: "expense", title: "Lẩu", amount: 880_000, payerMemberId: "h", toMemberId: null, shares: [{ memberId: "t", weight: 2 }, { memberId: "h", weight: 2 }], occurredAt: 3, createdAt: 3, updatedAt: 3, deletedAt: null },
    { id: "e3", groupId: "g", kind: "expense", title: "Bỏ", amount: 999_000, payerMemberId: "h", toMemberId: null, shares: [{ memberId: "t", weight: 1 }], occurredAt: 4, createdAt: 4, updatedAt: 9, deletedAt: 9 },
  ],
  events: [],
};

it("viewGroup: kết quả, tổng chi (bỏ món đã xoá), mình là ai, người tạo", () => {
  const v = viewGroup(data, "u-t");
  expect(v.members.map((m) => m.name)).toEqual(["Nhà T", "Nhà Hùng"]);
  expect(v.transfers).toEqual([{ from: "t", to: "h", amount: 216_000 }]);
  expect(v.total).toBe(1_104_000);
  expect(v.me?.id).toBe("t");
  expect(v.myBalance).toBe(-216_000);
  expect(v.isCreator).toBe(true);
  expect(v.settled).toBe(false);
  expect(viewGroup(data, "u-h").isCreator).toBe(false);
});

function Line({ e }: { e: GroupEvent }) {
  const t = useGroupsT();
  return <p>{describeEvent(e, viewGroup(data, "u-t"), t)}</p>;
}

const ev = (p: Partial<GroupEvent>): GroupEvent => ({
  id: "x", groupId: "g", entity: "expense", entityId: "e2", kind: "create", before: null, after: null, at: 1, deviceId: "d", ...p,
});

it("câu lịch sử: người làm, sửa số tiền, thanh toán, thay đổi chưa lên server là của mình", () => {
  const snap = { kind: "expense", title: "Vịt", amount: 180_000, payerMemberId: "h", toMemberId: null, shares: [] };
  const cases: [GroupEvent, string][] = [
    [ev({ kind: "edit", actorMemberId: "h", userId: "u-h", before: snap, after: { ...snap, amount: 200_000 } }), "Nhà Hùng sửa Vịt 180.000 đ: số tiền 180.000 đ → 200.000 đ"],
    [ev({ kind: "create", after: { kind: "settlement", title: "", amount: 216_000, payerMemberId: "t", toMemberId: "h", shares: null } }), "Nhà T thêm Nhà T đã trả Nhà Hùng 216.000 đ"],
    [ev({ entity: "member", entityId: "h", kind: "claim", after: { name: "Nhà Hùng" }, userId: "u-h", actorMemberId: "h" }), "Nhà Hùng nhận vị trí trong nhóm"],
    [ev({ entity: "member", entityId: "h", kind: "edit", actorMemberId: "t", userId: "u-t", before: { name: "Hùng", weight: 1 }, after: { name: "Nhà Hùng", weight: 2 } }), "Nhà T sửa Hùng (1 suất) → Nhà Hùng (2 suất)"],
    [ev({ entity: "group", entityId: "g", kind: "edit", userId: "u-x", before: { name: "A" }, after: { name: "B" } }), "Ai đó đổi tên nhóm: A → B"],
  ];
  for (const [e, text] of cases) {
    render(
      <I18nProvider>
        <Line e={e} />
      </I18nProvider>,
    );
    expect(screen.getByText(text)).toBeTruthy();
    cleanup();
  }
});
