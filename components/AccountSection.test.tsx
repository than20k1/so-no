import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n";
import { AccountSection } from "./AccountSection";
import { ToastProvider } from "./Toast";

const sync = vi.hoisted(() => ({
  logout: vi.fn(async () => {}),
  pendingGroupCount: vi.fn(async () => 0),
  refreshPending: vi.fn(async () => 0),
  syncNow: vi.fn(async () => {}),
  state: { phone: "+84912345678", phase: "idle", pending: 0, lastSyncAt: null },
}));
vi.mock("@/lib/sync", () => ({
  ...sync,
  syncStore: { subscribe: () => () => {}, getState: () => sync.state },
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function open() {
  render(
    <I18nProvider>
      <ToastProvider>
        <AccountSection itemClass="" />
      </ToastProvider>
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
  expect(screen.getByTestId("logout-confirm").textContent).toContain("nhóm chia tiền sẽ được xoá khỏi máy");
}

it("giữ sổ, không còn thay đổi nhóm: đăng xuất ngay", async () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Giữ sổ trên máy" }));
  await waitFor(() => expect(sync.logout).toHaveBeenCalledWith({ wipe: false }));
});

it("giữ sổ nhưng còn món chưa gửi: cảnh báo, chỉ đăng xuất khi xác nhận lần nữa", async () => {
  sync.pendingGroupCount.mockResolvedValueOnce(3);
  open();
  fireEvent.click(screen.getByRole("button", { name: "Giữ sổ trên máy" }));
  expect((await screen.findByTestId("logout-groups-unsynced")).textContent).toContain("Còn 3 thay đổi chia tiền");
  expect(sync.logout).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Vẫn đăng xuất" }));
  await waitFor(() => expect(sync.logout).toHaveBeenCalledWith({ wipe: false }));
});
