import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n";
import { initUpdates, resetUpdatesForTests } from "@/lib/update-sw";
import { VersionSection } from "./VersionSection";

afterEach(() => {
  cleanup();
  resetUpdatesForTests();
  vi.restoreAllMocks();
});

/** SW giả đang điều khiển trang, trả mã phiên bản "abc123"; `update` quyết định server có bản mới không. */
async function setup(update: (reg: { installing: unknown; waiting: unknown }) => Promise<void>) {
  const controller = {
    postMessage: (msg: { type: string }, ports: MessagePort[]) => {
      if (msg.type === "GET_VERSION") ports[0].postMessage("abc123");
    },
  };
  const reg = Object.assign(new EventTarget(), {
    installing: null as unknown,
    waiting: null as unknown,
    update: vi.fn(async () => update(reg)),
  });
  const container = Object.assign(new EventTarget(), { controller, register: vi.fn(async () => reg) });
  await initUpdates({ container: container as unknown as ServiceWorkerContainer, reload: vi.fn() });
  render(
    <I18nProvider>
      <VersionSection itemClass="" />
    </I18nProvider>,
  );
}

describe("VersionSection", () => {
  it("hiện mã phiên bản; kiểm tra khi đã mới nhất", async () => {
    await setup(async () => {});
    await waitFor(() => expect(screen.getByTestId("app-version").textContent).toBe("Phiên bản abc123"));

    fireEvent.click(screen.getByTestId("check-update"));
    await waitFor(() => expect(screen.getByTestId("update-result").textContent).toBe("Đang dùng bản mới nhất"));
  });

  it("server có bản mới → báo có bản mới", async () => {
    await setup(async (reg) => {
      reg.waiting = { postMessage: vi.fn() };
    });
    fireEvent.click(screen.getByTestId("check-update"));
    await waitFor(() => expect(screen.getByTestId("update-result").textContent).toBe("Có bản mới"));
  });

  it("mất mạng → báo cần kết nối", async () => {
    await setup(async () => {
      throw new TypeError("Failed to fetch");
    });
    fireEvent.click(screen.getByTestId("check-update"));
    await waitFor(() =>
      expect(screen.getByTestId("update-result").textContent).toBe("Cần kết nối mạng để kiểm tra bản mới"),
    );
  });
});
