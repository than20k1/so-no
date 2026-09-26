/**
 * Chuẩn hóa tên để tìm kiếm/ghép tên: bỏ dấu tiếng Việt, `đ → d`,
 * chữ thường, gộp khoảng trắng. "  Chị   Lân " → "chi lan".
 */
export function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Gộp khoảng trắng thừa trong tên hiển thị, giữ nguyên dấu và hoa thường. */
export function cleanDisplayName(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}
