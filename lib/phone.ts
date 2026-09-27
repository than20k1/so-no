/**
 * Chuẩn hoá số di động Việt Nam về dạng +84xxxxxxxxx. `null` nếu không hợp lệ.
 * Chấp nhận "0912 345 678", "0912.345.678", "+84 912 345 678", "84912345678".
 * Đầu số di động hiện hành: 03, 05, 07, 08, 09 (10 chữ số tính cả số 0).
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s.\-()]/g, "");
  const m = digits.match(/^(?:\+?84|0)([35789]\d{8})$/);
  return m ? `+84${m[1]}` : null;
}

/** "+84912345678" → "0912 345 678" để hiển thị. */
export function formatPhone(e164: string): string {
  const local = "0" + e164.slice(3);
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
