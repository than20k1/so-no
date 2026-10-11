import { describe, expect, it } from "vitest";
import { findDuplicates, parseGuestList } from "./guests";

describe("parseGuestList", () => {
  it("mỗi dòng một người, bỏ dòng trống và khoảng trắng thừa", () => {
    expect(parseGuestList("Vũ\n\n  Hoàng  \r\n   \nLương   Văn")).toEqual(["Vũ", "Hoàng", "Lương Văn"]);
  });

  it("ô trống → không có ai", () => {
    expect(parseGuestList("")).toEqual([]);
    expect(parseGuestList("  \n \n")).toEqual([]);
  });
});

describe("findDuplicates", () => {
  it("không trùng → rỗng", () => {
    expect(findDuplicates("Thân", ["Vũ", "Hoàng", "Lương"])).toEqual([]);
  });

  it("trùng giữa các dòng, bỏ dấu và không phân biệt hoa thường", () => {
    expect(findDuplicates("Thân", ["Vũ", "vu"])).toEqual([{ name: "Vũ", count: 2 }]);
  });

  it("trùng tên trưởng nhóm", () => {
    expect(findDuplicates("Thân", ["Vũ", "thân"])).toEqual([{ name: "Thân", count: 2 }]);
  });

  it("nhiều tên trùng, đếm đủ số lần, theo thứ tự xuất hiện", () => {
    expect(findDuplicates("An", ["Vũ", "Ân", "vu", "VŨ", "Hoàng", "hoang"])).toEqual([
      { name: "An", count: 2 },
      { name: "Vũ", count: 3 },
      { name: "Hoàng", count: 2 },
    ]);
  });

  it("khoảng trắng thừa giữa các chữ không làm khác tên", () => {
    expect(findDuplicates("An", ["Nhà  Hùng", "nha hung"])).toEqual([{ name: "Nhà Hùng", count: 2 }]);
  });
});
