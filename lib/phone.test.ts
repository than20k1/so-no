
import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each(["0912 345 678", "0912345678", "+84912345678", "84912345678", "+84 912 345 678", "0912.345.678", "(091) 234-5678"])(
    "%s → +84912345678",
    (input) => {
      expect(normalizePhone(input)).toBe("+84912345678");
    },
  );

  it.each(["", "0123456789", "0212345678", "091234567", "09123456789", "+85912345678", "abc0912345678"])(
    "%s không hợp lệ",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );

  it("các đầu số di động 03/05/07/08/09", () => {
    for (const p of ["0321234567", "0561234567", "0701234567", "0861234567", "0981234567"]) {
      expect(normalizePhone(p)).toMatch(/^\+84\d{9}$/);
    }
  });
});

it("formatPhone", () => {
  expect(formatPhone("+84912345678")).toBe("0912 345 678");
});
