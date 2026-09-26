import { normalizeName } from "./text";

type Matchable = { searchKey: string };

export type ResolveResult<T extends Matchable> =
  | { type: "existing"; debtor: T }
  | { type: "create" }
  | { type: "ambiguous"; matches: T[] };

/**
 * Quyết định tên gõ vào ứng với ai khi người dùng không chọn gợi ý:
 * trùng khóa tìm kiếm với đúng 1 người → người đó; không ai → tạo mới; nhiều người → phải chọn.
 */
export function resolveDebtor<T extends Matchable>(input: string, debtors: readonly T[]): ResolveResult<T> {
  const key = normalizeName(input);
  const matches = debtors.filter((d) => d.searchKey === key);
  if (matches.length === 1) return { type: "existing", debtor: matches[0] };
  if (matches.length === 0) return { type: "create" };
  return { type: "ambiguous", matches };
}

/** Lọc gợi ý theo chuỗi đã gõ (không dấu, không phân biệt hoa thường). */
export function filterByName<T extends Matchable>(query: string, debtors: readonly T[]): T[] {
  const q = normalizeName(query);
  if (!q) return [...debtors];
  return debtors.filter((d) => d.searchKey.includes(q));
}
