import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n";
import { initUpdates, resetUpdatesForTests } from "@/lib/update-sw";
import { UpdateBar } from "./UpdateBar";

afterEach(() => {
  cleanup();
  resetUpdatesForTests();
});

/** Trang đang do bản cũ điều khiển; `waiting` = bản mới đã tải xong. */
async function withWaitingVersion(waiting: boolean) {
  const worker = { postMessage: vi.fn() };
  const reg = Object.assign(new EventTarget(), { installing: null, waiting: waiting ? worker : null, update: vi.fn() });
  const container = Object.assign(new EventTarget(), { controller: {}, register: vi.fn(async () => reg) });
  await initUpdates({ container: container as unknown as ServiceWorkerContainer, reload: vi.fn() });
  return worker;
}

function renderBar() {
  return render(
    <I18nProvider>
      <UpdateBar />
    </I18nProvider>,
  );
}

describe("UpdateBar", () => {
  it("không có bản mới thì không hiện", async () => {
    await withWaitingVersion(false);
    renderBar();
    expect(screen.queryByTestId("update-bar")).toBeNull();
  });

  it("có bản mới thì hiện; bấm Cập nhật thì bật bản mới", async () => {
    const worker = await withWaitingVersion(true);
    renderBar();
    expect(screen.getByTestId("update-bar").textContent).toContain("Có bản mới");

    fireEvent.click(screen.getByRole("button", { name: "Cập nhật" }));
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("bấm đóng thì ẩn tạm", async () => {
    await withWaitingVersion(true);
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(screen.queryByTestId("update-bar")).toBeNull();
  });
});
