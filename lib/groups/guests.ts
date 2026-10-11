// Danh sách thành viên nhập lúc tạo nhóm (spec group-expenses, design chinh-luong-nhom D2) — hàm thuần, dùng chung cho form và lõi.
import { cleanDisplayName, normalizeName } from "../text";

export interface DuplicateName {
  /** Cách viết ở lần xuất hiện đầu tiên. */
  name: string;
  /** Số người mang tên này (kể cả lần đầu). */
  count: number;
}

/** Mỗi dòng một người: gộp khoảng trắng thừa, bỏ dòng trống. */
export function parseGuestList(text: string): string[] {
  return text.split(/\r?\n/).map(cleanDisplayName).filter(Boolean);
}

/** Các tên trùng nhau (bỏ dấu, không phân biệt hoa thường) giữa trưởng nhóm và các thành viên, theo thứ tự gõ. */
export function findDuplicates(selfName: string, guests: readonly string[]): DuplicateName[] {
  const seen = new Map<string, DuplicateName>();
  for (const raw of [selfName, ...guests]) {
    const name = cleanDisplayName(raw);
    const key = normalizeName(name);
    if (!key) continue;
    const entry = seen.get(key);
    if (entry) entry.count += 1;
    else seen.set(key, { name, count: 1 });
  }
  return [...seen.values()].filter((d) => d.count > 1);
}
