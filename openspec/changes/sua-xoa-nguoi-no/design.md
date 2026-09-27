# Design

## Context

- Dữ liệu nằm trong IndexedDB qua Dexie (`lib/ledger/db.ts`, schema version 1: `books`, `debtors`, `transactions`, `meta`). Giao diện chỉ gọi `lib/ledger`, không đụng Dexie trực tiếp.
- `Debtor` hiện không có trạng thái xoá; `listDebtors()` trả mọi người nợ của sổ và là nguồn chung cho màn chính, gợi ý tên (`DebtForm`) và ghép tên (`resolveDebtor`, `importBatch`).
- Truy vấn live (`useLiveQuery`) chạy trong transaction chỉ-đọc: không được ghi trong đó.
- File sao lưu định dạng `ghi-no-backup` version 1; nhập gộp theo id, bỏ qua bản ghi đã có.
- Icon hiện sinh từ HTML trong `scripts/gen-icons.mjs`; manifest dùng chung `icon-512.png` cho cả `any` và `maskable`.
- Ngân sách JS màn chính 180KB, đang dùng ~175,8KB: phần mới không được nằm trong bundle màn chính.
- Change sau (`dang-nhap-dong-bo`) sẽ đồng bộ bảng người nợ theo "bản sửa mới nhất thắng" và gộp sự kiện theo id.

## Goals / Non-Goals

**Goals:**
- Trạng thái xoá đọc nhanh được (lọc trong bộ nhớ như hiện nay), không phải dựng lại từ sự kiện.
- Mọi thao tác thay đổi người nợ là nguyên tử: cập nhật dòng người nợ + thêm sự kiện trong cùng một transaction.
- Dữ liệu cũ và file sao lưu cũ dùng tiếp được, không cần người dùng làm gì.
- Dữ liệu sẵn dạng đồng bộ: sự kiện có UUID + `deviceId`, người nợ có `updatedAt` tăng mỗi lần đổi.

**Non-Goals:**
- Công cụ admin khôi phục người đã xoá hẳn (làm ở change đồng bộ, khi dữ liệu có trên server).
- Dùng giờ server cho mốc 15/30 ngày (chưa có server).
- Sửa hay xoá từng giao dịch (sổ vẫn chỉ ghi thêm; đã có hoàn tác bằng đánh dấu hủy).
- Gộp hai người nợ trùng nhau.

## Decisions

### D1. Trạng thái nằm trên dòng người nợ, sự kiện chỉ để làm dấu vết
`Debtor` thêm `deletedAt: number | null` và `purgedAt: number | null`. Bảng mới `debtorEvents` lưu dấu vết:

```ts
interface DebtorEvent {
  id: string;            // UUID
  bookId: string;
  debtorId: string;
  kind: "edit" | "delete" | "restore" | "purge";
  before: { name: string; note: string } | null;  // chỉ với "edit"
  after:  { name: string; note: string } | null;
  at: number;
  deviceId: string;
}
```

- Mỗi thao tác (`editDebtor`, `deleteDebtor`, `restoreDebtor`, `purgeDebtor`) chạy trong một transaction rw: sửa dòng `debtors` (kèm `updatedAt`) + `debtorEvents.add`.
- Không có sự kiện "create": thời điểm tạo lấy từ `debtor.createdAt`, nên không phải bù sự kiện cho dữ liệu cũ.
- `editDebtor` không đổi gì (tên/ghi chú sau khi làm sạch trùng giá trị cũ) → không ghi gì.
- *Phương án khác*: dựng trạng thái từ chuỗi sự kiện (event sourcing). Bỏ vì mỗi lần đọc danh sách phải gộp sự kiện, chậm và phức tạp hơn, trong khi đồng bộ theo "bản mới nhất thắng" trên dòng người nợ vẫn đủ.

### D2. Dexie version 2
```ts
this.version(2).stores({ debtorEvents: "id, debtorId, bookId, at" })
  .upgrade(tx => tx.table("debtors").toCollection().modify(d => { d.deletedAt ??= null; d.purgedAt ??= null; }));
```
Giữ nguyên các bảng cũ. Code đọc vẫn coi `undefined` như `null` để an toàn.

### D3. Lọc tập trung trong `lib/ledger`
- `listDebtors()` chỉ trả người **chưa xoá** (`deletedAt == null`). Màn chính, gợi ý tên, `resolveDebtor` và `importBatch` tự động bỏ qua người đã xoá mà không phải sửa từng nơi.
- `listTrash()` mới: `deletedAt != null && purgedAt == null`, sắp xếp theo `deletedAt` giảm dần.
- `getDebtor(id)` trả cả người trong thùng rác (màn chi tiết hiện trạng thái đã xoá), nhưng trả `undefined` nếu đã xoá hẳn → màn chi tiết báo "không tìm thấy".
- `addDebt`/`payDebt`/`editDebtor` với người đã xoá → `LedgerError("debtor_deleted")`, chặn cả khi mở đường dẫn cũ `/ghi/?id=`.

### D4. Mốc 15/30 ngày là hàm thuần
```ts
const PURGE_ALLOWED_MS = 15 * DAY; const AUTO_PURGE_MS = 30 * DAY;
trashState(deletedAt, now) -> { canPurge, purgeAllowedAt, autoPurgeAt }
```
- Mốc tính bằng mili giây từ `deletedAt` (đủ 15×24h, không làm tròn theo ngày lịch), dễ test bằng cách truyền `now`.
- Tự xoá hẳn: `purgeExpired(now)` chạy trong effect của `Providers` ngay sau `getContext()` (ngoài truy vấn live), và khi mở màn Thùng rác. Ghi sự kiện `purge` với `at = now`.
- `purgeDebtor` kiểm tra lại `canPurge` trong lớp dữ liệu, không chỉ ẩn nút ở giao diện.

### D5. Hoàn tác xoá = khôi phục
Nút "Hoàn tác" trên thông báo gọi `restoreDebtor` (ghi sự kiện `restore`), không xoá sự kiện `delete`. Nhất quán với nguyên tắc chỉ ghi thêm: lịch sử sẽ thấy "xoá" rồi "khôi phục".

### D6. Giao diện
- **Màn chi tiết**: nút "Sửa" ở góc phải header mở bảng trượt từ dưới (`DebtorEditSheet`, tải bằng `next/dynamic`), gồm tên, ghi chú, nút Lưu và nút "Xoá người này". Bấm xoá mở bước xác nhận ngay trong bảng (nêu số dư), không dùng `window.confirm`. Xoá xong: `router.replace("/")` và thông báo "Đã xoá <tên>" kèm "Hoàn tác".
- **Người trong thùng rác**: màn chi tiết thay hai nút ghi/trừ bằng khung "Đã xoá ngày …" + nút "Khôi phục".
- **Lịch sử sửa**: mục riêng dưới lịch sử giao dịch, mới nhất ở trên, dòng cuối là "Tạo ngày …".
- **Thùng rác**: trang tĩnh mới `app/thung-rac/page.tsx`. Mỗi dòng gồm tên, số dư, ngày xoá, "Tự xoá hẳn sau N ngày", nút "Khôi phục", và nút "Xoá hẳn" (vô hiệu kèm dòng "Xoá hẳn được từ ngày dd/MM" khi chưa đủ 15 ngày). Xoá hẳn có bước xác nhận.
- **Menu**: mục "Thùng rác (n)", đếm bằng truy vấn live trong `Menu` (menu đã tải lười nên màn chính không tăng JS).

### D7. Sao lưu version 2
- `BACKUP_VERSION = 2`, file thêm mảng `debtorEvents`; người nợ mang `deletedAt`/`purgedAt`.
- `parseBackup` chấp nhận version 1 và 2; với version 1: `debtorEvents = []`, người nợ thiếu trường thì gán `null`.
- Nhập: gộp sự kiện theo id như giao dịch. Người nợ đã có cùng id vẫn **bỏ qua** như trước (không ghi đè trạng thái xoá trên máy); đối chiếu "bản mới nhất thắng" để dành cho change đồng bộ.
- Tóm tắt trước khi nhập giữ nguyên các con số (người, giao dịch, bỏ qua); sự kiện được gộp kèm, không cần hiển thị riêng.

### D8. Icon
- Nguồn duy nhất: `scripts/icon.svg` (chép từ `assets/icon.svg` của change này).
- `gen-icons.mjs` đọc SVG, dùng Chromium của Playwright chụp ra: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180), `icon-32.png` (favicon), và `icon-maskable-512.png`. Bản maskable thu nhỏ hình còn 80% trên nền đỏ, để góc cuốn sổ nằm trong vòng an toàn (bán kính 40%).
- Chỉ phát hành PNG. Chữ "NỢ" được vẽ bằng font của máy dev lúc sinh ảnh, nên trên điện thoại người dùng không phụ thuộc font.
- `manifest.ts` dùng `icon-maskable-512.png` cho `purpose: "maskable"`; `layout.tsx` thêm favicon 32px.

## Risks / Trade-offs

- [Chỉnh giờ máy để lách mốc 15/30 ngày] → Chấp nhận ở bản offline vì dữ liệu không bao giờ mất thật; change đồng bộ sẽ dùng giờ server.
- [Tab cũ còn mở chạy code version 1 khi DB đã lên version 2] → Dexie tự đóng kết nối cũ khi có `versionchange`; bản mới chỉ được áp dụng ở lần mở sau (service worker không skipWaiting), nên thường không có hai phiên bản cùng lúc. Nếu tab cũ ghi thất bại, người dùng mở lại app là xong.
- [Không quay lại được bản cũ sau khi DB lên version 2: Dexie version 1 báo `VersionError`] → Chỉ sửa tiến, không rollback bản deploy. Nếu buộc phải rollback: xuất sao lưu trước rồi nhập lại.
- [Dữ liệu "xoá hẳn" vẫn chiếm chỗ] → Chỉ là chữ, vài trăm byte mỗi dòng; không đáng kể.
- [Đổi tên trùng người khác làm ghép tên thành "trùng nhiều người"] → Luồng đã có sẵn: báo "chọn một người" khi lưu; cảnh báo lúc đổi tên giúp tránh từ đầu.
- [Tự xoá hẳn chạy lúc mở app có thể làm chậm khởi động] → Một truy vấn quét người đã xoá (thường 0–vài dòng), chạy sau khi màn chính đã hiện.

## Migration Plan

1. Deploy như bình thường. Lần mở đầu sau cập nhật, Dexie nâng DB lên version 2 và gán `deletedAt`/`purgedAt = null` cho người nợ cũ.
2. File sao lưu cũ vẫn nhập được; file mới (version 2) không nhập được vào app bản cũ (báo "phiên bản không hỗ trợ", dữ liệu không đổi).
3. Không rollback bản deploy (xem Risks); lỗi thì sửa tiến.
