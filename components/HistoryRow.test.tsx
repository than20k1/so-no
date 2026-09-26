import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/lib/i18n";
import type { Transaction } from "@/lib/ledger";
import { HistoryRow } from "./DebtorDetail";

afterEach(cleanup);

const year = new Date().getFullYear();
const at = (month: number, day: number, h = 7, m = 30) => new Date(year, month - 1, day, h, m).getTime();

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: "t",
    bookId: "b",
    debtorId: "d",
    amount: 200000,
    kind: "add",
    direction: "they_owe",
    occurredAt: at(9, 12),
    createdAt: at(9, 12),
    updatedAt: at(9, 12),
    voidedAt: null,
    source: "manual",
    note: "",
    deviceId: "x",
    ...partial,
  };
}

function renderRow(t: Transaction) {
  render(
    <I18nProvider>
      <ul>
        <HistoryRow tx={t} />
      </ul>
    </I18nProvider>,
  );
  return screen.getByTestId("history-row");
}

describe("HistoryRow", () => {
  it("dòng ghi tay: ngày giờ, dấu +, ghi chú, không nhãn nguồn", () => {
    const row = renderRow(tx({ note: "gạo 2 bao" }));
    expect(row.textContent).toContain("12/09 07:30");
    expect(row.textContent).toContain("+ 200.000");
    expect(row.textContent).toContain("gạo 2 bao");
    expect(row.textContent).not.toContain("nhập từ");
    expect(row.dataset.voided).toBeUndefined();
  });

  it("dòng đã hủy: gạch ngang và giờ hủy", () => {
    const row = renderRow(tx({ kind: "add", amount: 30000, voidedAt: at(9, 18, 8, 4) }));
    expect(row.dataset.voided).toBe("true");
    expect(row.textContent).toContain("Đã hủy lúc 18/09 08:04");
    expect(row.querySelector(".line-through")?.textContent).toContain("30.000");
  });

  it("dòng trừ nợ nhập từ sao lưu, ngày xảy ra khác ngày nhập", () => {
    const row = renderRow(tx({ kind: "pay", amount: 100000, source: "backup", occurredAt: at(5, 12), createdAt: at(9, 26) }));
    expect(row.textContent).toContain("12/05");
    expect(row.textContent).toContain("− 100.000");
    expect(row.textContent).toContain("nhập từ sao lưu ngày 26/09");
  });

  it("dòng không rõ ngày (sổ giấy): hiện ngày nhập kèm nhãn nguồn", () => {
    const row = renderRow(tx({ source: "scan", occurredAt: null, createdAt: at(9, 26) }));
    expect(row.textContent).toContain("26/09");
    expect(row.textContent).toContain("không rõ ngày");
    expect(row.textContent).toContain("nhập từ sổ giấy ngày 26/09");
  });
});
