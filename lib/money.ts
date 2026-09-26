/** Số tiền tối đa cho một giao dịch (1 tỷ đồng) — chặn gõ nhầm quá nhiều số. */
export const MAX_AMOUNT = 1_000_000_000;

/** Người dùng gõ theo đơn vị nghìn đồng: "50" → 50.000 đồng. Chuỗi trống/không hợp lệ → 0. */
export function parseAmount(thousands: string): number {
  const digits = thousands.replace(/\D/g, "");
  if (!digits) return 0;
  return Math.min(Number(digits) * 1000, MAX_AMOUNT);
}

/** Đổi số tiền đồng về chuỗi nghìn để hiện lại trong ô nhập: 120000 → "120". */
export function toThousandsInput(amount: number): string {
  return amount > 0 ? String(Math.floor(amount / 1000)) : "";
}

/** Dấu chấm phân cách hàng nghìn: 1200000 → "1.200.000". */
export function formatNumber(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 1200000 → "1.200.000 đ". Dùng chung cho mọi ngôn ngữ. */
export function formatMoney(n: number): string {
  return `${formatNumber(n)} đ`;
}
