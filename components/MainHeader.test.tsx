import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n";
import { writeAccountMarker } from "@/lib/sync/marker";
import { resetUpdateStateForTests, updateStore } from "@/lib/update";
import { GroupsScreen } from "./groups/GroupsScreen";
import { HomeScreen } from "./HomeScreen";
import { ToastProvider } from "./Toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
// Màn Chia tiền đã đăng nhập sẽ tải lười bộ đồng bộ — không cần ở đây.
vi.mock("@/lib/sync", () => ({ syncNow: vi.fn(async () => {}) }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetUpdateStateForTests();
});

function renderScreen(ui: React.ReactNode) {
  return render(
    <I18nProvider>
      <ToastProvider>{ui}</ToastProvider>
    </I18nProvider>,
  );
}

const safe = () => updateStore.getState().safe;

describe("màn an toàn để tự áp dụng bản mới", () => {
  it("màn Chia tiền: an toàn khi form tạo nhóm đóng, không an toàn khi đang mở", () => {
    writeAccountMarker({ phone: "+84900000000" });
    renderScreen(<GroupsScreen />);
    expect(safe()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "+ Tạo nhóm" }));
    expect(safe()).toBe(false);
  });

  it("màn Ghi nợ: đang gõ tìm tên thì không an toàn; rời màn thì không còn an toàn", () => {
    const view = renderScreen(<HomeScreen />);
    expect(safe()).toBe(true);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Lan" } });
    expect(safe()).toBe(false);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(safe()).toBe(true);

    view.unmount();
    expect(safe()).toBe(false);
  });

  it("mở menu thì không an toàn", () => {
    renderScreen(<HomeScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(safe()).toBe(false);
  });
});
