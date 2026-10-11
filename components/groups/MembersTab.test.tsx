import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { viewGroup } from "@/lib/groups/view";
import { I18nProvider } from "@/lib/i18n";
import type { GroupMember } from "@/lib/ledger/types";
import { ToastProvider } from "../Toast";
import { MembersTab } from "./GroupDetail";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const member = (id: string, name: string, userId: string | null, orderKey: number): GroupMember => ({
  id, groupId: "g1", name, searchKey: name.toLowerCase(), weight: 1, userId, orderKey, createdAt: orderKey, updatedAt: orderKey, removedAt: null,
});

/** Nhóm "Đà Lạt" do `u-than` tạo, `u-minh` đã vào nhóm. */
function renderAs(userId: string) {
  const view = viewGroup(
    {
      group: { id: "g1", name: "Đà Lạt", createdByUserId: "u-than", createdAt: 1, updatedAt: 1, deletedAt: null },
      members: [member("m1", "Thân", "u-than", 1), member("m2", "Minh", "u-minh", 2), member("m3", "Vũ", null, 3)],
      items: [],
      events: [],
    },
    userId,
  );
  render(
    <I18nProvider>
      <ToastProvider>
        <MembersTab g={view} />
      </ToastProvider>
    </I18nProvider>,
  );
}

describe("quản lý nhóm: Rời nhóm", () => {
  it("người tạo nhóm không thấy nút Rời nhóm, vẫn có Đổi tên và Xoá nhóm", () => {
    renderAs("u-than");
    expect(screen.queryByRole("button", { name: "Rời nhóm" })).toBeNull();
    expect(screen.getByRole("button", { name: "Đổi tên nhóm" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Xoá nhóm" })).toBeTruthy();
  });

  it("thành viên khác vẫn thấy Rời nhóm, không có Xoá nhóm", () => {
    renderAs("u-minh");
    expect(screen.getByRole("button", { name: "Rời nhóm" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Xoá nhóm" })).toBeNull();
  });
});
