// Chế độ dùng lần cuối (Ghi nợ / Chia tiền) — nhớ trên máy để mở lại đúng màn (delta home-screen).
export type AppMode = "ghi-no" | "chia-tien";
export const MODE_KEY = "so-no.mode";

export function saveMode(mode: AppMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {}
}

/**
 * Script chạy trước khi hydrate ở `/`: lần trước dùng Chia tiền thì chuyển thẳng sang đó,
 * để màn Ghi nợ không nháy lên trước (design D9). Lỗi gì cũng ở lại Ghi nợ.
 */
export const MODE_REDIRECT_SCRIPT = `try{if(location.pathname==="/"&&localStorage.getItem(${JSON.stringify(MODE_KEY)})==="chia-tien")location.replace("/chia-tien/")}catch(e){}`;
