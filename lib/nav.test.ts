import { expect, it } from "vitest";
import { safeNext, withNext } from "./nav";

it("chỉ nhận đường dẫn trong app cho ?next=", () => {
  expect(safeNext("/chia-tien/")).toBe("/chia-tien/");
  expect(safeNext("/chia-tien/tham-gia/")).toBe("/chia-tien/tham-gia/");
  for (const bad of [null, "", "//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)"]) expect(safeNext(bad)).toBe("/");
  expect(withNext("/dang-ky/", "/chia-tien/")).toBe("/dang-ky/?next=%2Fchia-tien%2F");
  expect(withNext("/dang-ky/", "//evil.com")).toBe("/dang-ky/");
});
