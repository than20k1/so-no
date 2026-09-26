const pad = (n: number) => String(n).padStart(2, "0");

/** "25/09" — thêm năm nếu khác năm hiện tại: "12/05/2025". */
export function formatDate(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const base = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base}/${d.getFullYear()}`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(ts: number, now = Date.now()): string {
  return `${formatDate(ts, now)} ${formatTime(ts)}`;
}

export function isSameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** "2026-09-26" theo giờ máy — dùng cho tên file sao lưu. */
export function isoDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
