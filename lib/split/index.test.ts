import { describe, expect, it } from "vitest";
import { balances, computeShares, isSettled, settle, type SplitItem, type SplitMember } from "./index";

const members = (...ids: string[]): SplitMember[] => ids.map((id, i) => ({ id, orderKey: i + 1 }));
const expense = (payer: string, amount: number, shares: [string, number][]): SplitItem => ({
  kind: "expense",
  amount,
  payerMemberId: payer,
  shares: shares.map(([memberId, weight]) => ({ memberId, weight })),
});

describe("computeShares", () => {
  it("100.000 chia 3: người vào trước nhận phần dư", () => {
    const m = members("an", "binh", "chi");
    const parts = computeShares(100_000, [{ memberId: "chi", weight: 1 }, { memberId: "an", weight: 1 }, { memberId: "binh", weight: 1 }], m);
    expect(Object.fromEntries(parts)).toEqual({ an: 33_334, binh: 33_333, chi: 33_333 });
  });

  it("chia theo suất", () => {
    const parts = computeShares(700_000, [{ memberId: "t", weight: 2 }, { memberId: "h", weight: 2 }], members("t", "h"));
    expect(Object.fromEntries(parts)).toEqual({ t: 350_000, h: 350_000 });
  });

  it("không ai cùng chia thì không ai góp", () => {
    expect(computeShares(1000, [], members("a")).size).toBe(0);
  });
});

describe("balances + settle", () => {
  it("chuyến đi trong ghi chú: Nhà T → Nhà Hùng 216.000", () => {
    const m = members("T", "H");
    const items = [
      expense("T", 54_000, [["H", 2]]),
      expense("T", 80_000, [["H", 2]]),
      expense("T", 90_000, [["H", 2]]),
      expense("H", 700_000, [["T", 2], ["H", 2]]),
      expense("H", 180_000, [["T", 2], ["H", 2]]),
    ];
    const bal = balances(m, items);
    expect(Object.fromEntries(bal)).toEqual({ T: -216_000, H: 216_000 });
    expect(settle(bal, m)).toEqual([{ from: "T", to: "H", amount: 216_000 }]);
  });

  it("nhóm ba người: An trả 300.000 chia đều", () => {
    const m = members("an", "binh", "chi");
    const bal = balances(m, [expense("an", 300_000, [["an", 1], ["binh", 1], ["chi", 1]])]);
    expect(settle(bal, m)).toEqual([
      { from: "binh", to: "an", amount: 100_000 },
      { from: "chi", to: "an", amount: 100_000 },
    ]);
  });

  it("dòng thanh toán và món đã xoá", () => {
    const m = members("T", "H");
    const items: SplitItem[] = [
      expense("H", 432_000, [["T", 1], ["H", 1]]),
      { kind: "settlement", amount: 100_000, payerMemberId: "T", toMemberId: "H" },
      { ...expense("H", 999_000, [["T", 1]]), deletedAt: 5 },
    ];
    const bal = balances(m, items);
    expect(settle(bal, m)).toEqual([{ from: "T", to: "H", amount: 116_000 }]);
    expect(isSettled(bal, items)).toBe(false);
    const done = [...items, { kind: "settlement", amount: 116_000, payerMemberId: "T", toMemberId: "H" } as SplitItem];
    const bal2 = balances(m, done);
    expect(settle(bal2, m)).toEqual([]);
    expect(isSettled(bal2, done)).toBe(true);
  });

  it("chưa có món thì chưa phải đã xong", () => {
    expect(isSettled(new Map([["a", 0]]), [])).toBe(false);
  });

  it("ngẫu nhiên: tổng 0, áp kết quả thì ai cũng về 0, tối đa n−1 lần chuyển", () => {
    let seed = 42;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let round = 0; round < 300; round++) {
      const n = 2 + rnd(9);
      const m = members(...Array.from({ length: n }, (_, i) => `m${i}`));
      const items: SplitItem[] = [];
      for (let k = 0; k < 1 + rnd(12); k++) {
        if (rnd(5) === 0) {
          items.push({ kind: "settlement", amount: 1 + rnd(500_000), payerMemberId: `m${rnd(n)}`, toMemberId: `m${rnd(n)}` });
        } else {
          const shares: [string, number][] = m.filter(() => rnd(3) > 0).map((x) => [x.id, 1 + rnd(3)]);
          if (shares.length === 0) shares.push([m[0].id, 1]);
          items.push(expense(`m${rnd(n)}`, 1 + rnd(3_000_000), shares));
        }
      }
      const bal = balances(m, items);
      expect([...bal.values()].reduce((a, b) => a + b, 0)).toBe(0);
      const transfers = settle(bal, m);
      const nonZero = [...bal.values()].filter((v) => v !== 0).length;
      expect(transfers.length).toBeLessThanOrEqual(Math.max(nonZero - 1, 0));
      const after = new Map(bal);
      for (const t of transfers) {
        expect(t.amount).toBeGreaterThan(0);
        after.set(t.from, after.get(t.from)! + t.amount);
        after.set(t.to, after.get(t.to)! - t.amount);
      }
      expect([...after.values()].every((v) => v === 0)).toBe(true);
    }
  });
});
