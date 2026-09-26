import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, LANG_STORAGE_KEY, useI18n } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { vi as viDict } from "@/lib/i18n/vi";
import { TOAST_DURATION_MS, ToastProvider, useToast } from "./Toast";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

function LangProbe() {
  const { t, setLang } = useI18n();
  return (
    <>
      <span data-testid="label">{t("addDebt")}</span>
      <span data-testid="toast">{t("toastAdded", { amount: "50.000 đ", name: "Lan" })}</span>
      <button onClick={() => setLang("en")}>en</button>
    </>
  );
}

describe("i18n", () => {
  it("hai từ điển có cùng bộ khóa", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(viDict).sort());
  });

  it("mặc định tiếng Việt, đổi ngôn ngữ áp dụng ngay và giữ sau khi mở lại", () => {
    const first = render(
      <I18nProvider>
        <LangProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("label").textContent).toBe("Ghi nợ");
    expect(screen.getByTestId("toast").textContent).toBe("Đã ghi 50.000 đ cho Lan");

    fireEvent.click(screen.getByText("en"));
    expect(screen.getByTestId("label").textContent).toBe("Add debt");
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe("en");
    first.unmount();

    render(
      <I18nProvider>
        <LangProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("label").textContent).toBe("Add debt");
  });
});

function ToastTrigger({ onUndo }: { onUndo: () => void }) {
  const show = useToast();
  return <button onClick={() => show({ message: "Đã ghi", actionLabel: "Hoàn tác", onAction: onUndo })}>go</button>;
}

describe("Toast", () => {
  it("hiện ít nhất 5 giây rồi tự ẩn; bấm Hoàn tác gọi hành động", () => {
    vi.useFakeTimers();
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <ToastTrigger onUndo={onUndo} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("go"));
    expect(screen.getByRole("status").textContent).toContain("Đã ghi");
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByRole("status")).not.toBeNull();
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 5000 + 1));
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(screen.getByText("go"));
    fireEvent.click(screen.getByText("Hoàn tác"));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
