import { expect, it } from "vitest";
import { accountVi } from "./account";
import { en } from "./en";
import { groupsEn, groupsVi } from "./groups";
import { vi } from "./vi";

it("từ điển Chia tiền vi/en cùng bộ khoá và không trùng khoá với từ điển chính hay tài khoản", () => {
  expect(Object.keys(groupsEn).sort()).toEqual(Object.keys(groupsVi).sort());
  const other = new Set([...Object.keys(vi), ...Object.keys(en), ...Object.keys(accountVi)]);
  expect(Object.keys(groupsVi).filter((k) => other.has(k))).toEqual([]);
});
