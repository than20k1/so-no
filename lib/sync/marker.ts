// Đánh dấu "máy này đang đăng nhập" (không phải bí mật — phiên thật nằm trong cookie httpOnly).
// File nhỏ, không phụ thuộc gì: màn chính chỉ cần nó để quyết định có tải lib/sync hay không (design D11).
export const ACCOUNT_KEY = "so-no.account";

export interface AccountMarker {
  phone: string;
}

export function readAccountMarker(): AccountMarker | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as AccountMarker) : null;
  } catch {
    return null;
  }
}

export function writeAccountMarker(marker: AccountMarker | null): void {
  try {
    if (marker) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(marker));
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch {}
}
