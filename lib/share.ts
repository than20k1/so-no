export type ShareOutcome = "shared" | "downloaded" | "cancelled";

/** Mở bảng chia sẻ (gửi qua Zalo, lưu vào Tệp...) nếu máy hỗ trợ, ngược lại tải file về. */
export async function shareOrDownload(blob: Blob, fileName: string): Promise<ShareOutcome> {
  const file = new File([blob], fileName, { type: blob.type });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return "shared";
    } catch (err) {
      if ((err as Error).name === "AbortError") return "cancelled";
      // Chia sẻ lỗi vì lý do khác → rơi xuống tải về.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
