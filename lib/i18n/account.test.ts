import { expect, it } from "vitest";
import { accountEn, accountVi } from "./account";
import { en } from "./en";
import { vi } from "./vi";

it("từ điển tài khoản vi/en cùng bộ khoá và không trùng khoá với từ điển chính", () => {
  expect(Object.keys(accountEn).sort()).toEqual(Object.keys(accountVi).sort());
  const main = new Set([...Object.keys(vi), ...Object.keys(en)]);
  expect(Object.keys(accountVi).filter((k) => main.has(k))).toEqual([]);
});
