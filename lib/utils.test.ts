import { describe, expect, it } from "vitest";
import { newId } from "./id";
import { formatMoney, parseAmount, toThousandsInput } from "./money";
import { filterByName, resolveDebtor } from "./resolve";
import { normalizeName } from "./text";

describe("normalizeName", () => {
  it("bỏ dấu và chữ thường", () => {
    expect(normalizeName("Chị Lân")).toBe("chi lan");
  });
  it("đ → d, gộp khoảng trắng", () => {
    expect(normalizeName("  ĐỨC  ")).toBe("duc");
    expect(normalizeName("Bác   Hùng  (cá)")).toBe("bac hung (ca)");
  });
});

describe("parseAmount / formatMoney", () => {
  it("gõ theo nghìn đồng", () => {
    expect(parseAmount("50")).toBe(50000);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("abc")).toBe(0);
    expect(parseAmount("1.200")).toBe(1200000);
  });
  it("định dạng dấu chấm", () => {
    expect(formatMoney(1200000)).toBe("1.200.000 đ");
    expect(formatMoney(0)).toBe("0 đ");
    expect(formatMoney(-50000)).toBe("-50.000 đ");
  });
  it("đổi ngược về ô nhập", () => {
    expect(toThousandsInput(120000)).toBe("120");
    expect(toThousandsInput(0)).toBe("");
  });
});

describe("resolveDebtor", () => {
  const lan = { id: "1", searchKey: "chi lan" };
  const lan2 = { id: "2", searchKey: "chi lan" };
  const tu = { id: "3", searchKey: "anh tu" };

  it("trùng khớp đúng 1 người → existing", () => {
    expect(resolveDebtor("chị lan", [lan, tu])).toEqual({ type: "existing", debtor: lan });
  });
  it("không ai khớp → create", () => {
    expect(resolveDebtor("Bác Hùng", [lan, tu])).toEqual({ type: "create" });
  });
  it("nhiều người cùng khóa → ambiguous", () => {
    expect(resolveDebtor("Chi Lan", [lan, lan2, tu])).toEqual({ type: "ambiguous", matches: [lan, lan2] });
  });
  it("gợi ý theo chuỗi con không dấu", () => {
    const list = [
      { searchKey: "chi lan" },
      { searchKey: "co lan" },
      { searchKey: "anh tu" },
    ];
    expect(filterByName("LÁN", list).map((d) => d.searchKey)).toEqual(["chi lan", "co lan"]);
  });
});

describe("newId", () => {
  it("10.000 id không trùng và đúng dạng UUID v4", () => {
    const ids = new Set(Array.from({ length: 10000 }, newId));
    expect(ids.size).toBe(10000);
    for (const id of [...ids].slice(0, 20)) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
