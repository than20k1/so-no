import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { I18nProvider } from "@/lib/i18n";
import type { DebtorEvent } from "@/lib/ledger";
import { EditHistory } from "./DebtorDetail";

afterEach(cleanup);

const year = new Date().getFullYear();
const at = (month: number, day: number) => new Date(year, month - 1, day, 9, 5).getTime();

function ev(partial: Partial<DebtorEvent>): DebtorEvent {
  return {
    id: partial.kind ?? "e",
    bookId: "b",
    debtorId: "d",
    kind: "edit",
    before: null,
    after: null,
    at: at(9, 27),
    deviceId: "x",
    ...partial,
  };
}

it("hiển thị lịch sử sửa theo thứ tự được truyền vào, dòng cuối là lúc tạo", () => {
  render(
    <I18nProvider>
      <EditHistory
        createdAt={at(9, 12)}
        events={[
          ev({ id: "r", kind: "restore", at: at(9, 28) }),
          ev({ id: "d", kind: "delete", at: at(9, 27) }),
          ev({
            id: "e",
            kind: "edit",
            at: at(9, 26),
            before: { name: "Chi Lan", note: "" },
            after: { name: "Chị Lan", note: "rau" },
          }),
        ]}
      />
    </I18nProvider>,
  );
  const rows = screen.getAllByTestId("edit-row").map((r) => r.textContent);
  expect(rows).toEqual([
    "28/09 09:05Khôi phục",
    "27/09 09:05Xoá vào thùng rác",
    "26/09 09:05Đổi tên: Chi Lan → Chị LanĐổi ghi chú: (trống) → rau",
    "12/09 09:05Tạo người nợ",
  ]);
});
