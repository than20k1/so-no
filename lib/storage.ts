/**
 * Xin trình duyệt giữ dữ liệu lâu dài (không tự dọn khi thiếu bộ nhớ).
 * Trình duyệt không hỗ trợ hoặc từ chối thì bỏ qua — app vẫn chạy bình thường.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
    if (!storage?.persist) return false;
    if (storage.persisted && (await storage.persisted())) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}
