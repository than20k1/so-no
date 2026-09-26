# Design

## Context

Dự án mới hoàn toàn, chưa có code. Động lực xem `proposal.md` (Why); hành vi chi tiết xem các spec trong `specs/`. Ràng buộc chính định hình thiết kế:

- Người dùng ở chợ: điện thoại Android giá rẻ hoặc iPhone cũ, mạng yếu/chập chờn.
- Bản 1 không có server; mọi dữ liệu nằm trên thiết bị.
- Bản 2 sẽ thêm đăng nhập + đồng bộ + quét sổ giấy bằng AI, nên dữ liệu bản 1 phải chuyển tiếp được mà không cần di chuyển dữ liệu phức tạp.

## Goals / Non-Goals

**Goals:**
- Đạt ngân sách hiệu năng trong spec `offline-app-shell` (≤180KB JS nén, bấm được trong 2s lần đầu / 1s lần sau).
- Mọi thao tác ghi/trừ/hoàn tác là thao tác cục bộ, không bao giờ chờ mạng.
- Tách lớp dữ liệu khỏi giao diện để bản 2 cắm đồng bộ vào mà không sửa màn hình.

**Non-Goals:**
- Không chọn công nghệ đồng bộ/backend (quyết định ở bản 2).
- Không làm SSR hay SEO — app là công cụ, không cần được tìm thấy qua Google.
- Không tối ưu cho màn hình máy tính (chỉ cần hiển thị được, cột giữa tối đa ~480px).

## Decisions

### D1. Next.js App Router, xuất tĩnh (`output: 'export'`)
Toàn bộ app build thành file HTML/JS/CSS tĩnh, host trên CDN tĩnh (Vercel hoặc Cloudflare Pages). Mọi trang là client component đọc dữ liệu từ IndexedDB.
- *Vì sao:* không có server nào cần chạy, HTML được phục vụ từ edge ngay lập tức, dễ cache hoàn toàn bằng service worker.
- *Thay thế đã cân nhắc:* SSR/Server Components — vô ích vì dữ liệu nằm trên máy người dùng, còn thêm độ trễ. Vite + React thuần — nhẹ hơn chút, nhưng người dùng đã chọn Next.js và bản 2 có thể cần API routes.

### D2. Định tuyến
| Đường dẫn | Màn hình |
|---|---|
| `/` | Màn chính |
| `/ghi` | Ghi nợ (nhận `?id=` để chọn sẵn người) |
| `/tru` | Trừ nợ (nhận `?id=`) |
| `/nguoi?id=<uuid>` | Chi tiết người nợ |

Dùng query string thay cho route động `[id]` vì xuất tĩnh không sinh trước được trang cho ID do người dùng tạo. Menu phụ là một ngăn trượt (drawer) trên màn chính, gắn với history (`pushState`) để nút quay lại của điện thoại đóng được menu.

### D3. Lưu trữ: IndexedDB qua Dexie.js
- *Vì sao:* Dexie nhỏ (~25KB nén), có transaction, index, versioning schema và hook `useLiveQuery` để giao diện tự cập nhật; có hướng đồng bộ sẵn cho bản 2.
- *Thay thế:* `localStorage` — đồng bộ, giới hạn ~5MB, chặn luồng chính, không có transaction. `idb` thuần — nhẹ hơn nhưng phải tự viết live query và migration.

### D4. Mô hình dữ liệu
Tên trường trong code dùng tiếng Anh; bảng ánh xạ với thuật ngữ trong spec:

```
books        { id, name, createdAt }                      -- "sổ"; bản 1 có đúng 1 sổ mặc định
debtors      { id, bookId, name, note, searchKey,
               balance, lastTxAt, createdAt, updatedAt }  -- "người nợ"
transactions { id, bookId, debtorId, amount, kind,        -- "giao dịch"
               direction, occurredAt, createdAt,
               updatedAt, voidedAt, source, note,
               deviceId }
meta         { key, value }                                -- deviceId, ngôn ngữ, lần sao lưu cuối...
```

- `id`: UUID v4 (`crypto.randomUUID`, có fallback) — tạo offline không trùng, sẵn cho đồng bộ.
- `amount`: số nguyên đồng, luôn dương; `kind`: `'add' | 'pay'` (ghi/trừ).
- `direction`: `'they_owe'` (bản 1 cố định); bản sau thêm `'i_owe'`.
- `occurredAt`: có thể `null` (sổ giấy không ghi ngày); `createdAt` không bao giờ sửa.
- `voidedAt`: `null` = còn hiệu lực; có giá trị = đã hủy.
- `source`: `'manual' | 'backup' | 'scan'`.
- Index Dexie: `debtors: id, bookId, searchKey, lastTxAt`; `transactions: id, debtorId, createdAt`.

### D5. Số dư được cache trên `debtors.balance`
Mỗi thao tác ghi/trừ/hủy chạy trong **một transaction Dexie** gồm: thêm/sửa giao dịch + cập nhật `balance`, `lastTxAt` của người nợ. Có hàm `recomputeBalance(debtorId)` tính lại từ giao dịch, dùng sau khi nhập sao lưu và trong test để kiểm chứng cache.
- *Vì sao:* danh sách màn chính chỉ đọc bảng `debtors` → nhanh kể cả khi có hàng chục nghìn giao dịch.
- *Thay thế:* tính số dư mỗi lần hiển thị — đơn giản nhưng chậm dần theo thời gian.

### D6. Tìm kiếm tên trong bộ nhớ
Chuẩn hóa: `NFD` → bỏ dấu kết hợp → `đ/Đ → d` → chữ thường → gộp khoảng trắng. Kết quả lưu vào `searchKey`. Khi mở màn chính/màn ghi, nạp toàn bộ `debtors` (vài trăm đến vài nghìn dòng, vài chục KB) vào bộ nhớ và lọc bằng `includes` trên mỗi phím gõ — không chờ IndexedDB.
- Quy tắc ghép tên khi lưu (spec `debt-recording`) nằm trong một hàm thuần `resolveDebtor(input, debtors)` trả về `existing | create | ambiguous`, dùng chung cho luồng ghi nợ và đường nhập hàng loạt.

### D7. Lớp dữ liệu (repository) tách biệt
Giao diện chỉ gọi các hàm trong `lib/ledger/`: `addDebt`, `payDebt`, `voidTransaction`, `importBatch`, `exportBackup`, `listDebtors`, `getHistory`. Giao diện không import Dexie trực tiếp (trừ `useLiveQuery` bọc trong hook riêng).
- *Vì sao:* bản 2 thêm hàng đợi đồng bộ bên trong các hàm này mà không đổi màn hình.

### D8. Đường nhập hàng loạt `importBatch(rows, source)`
Kiểm tra toàn bộ dòng trước → ghép tên bằng `resolveDebtor` (dòng `ambiguous` bị trả lỗi) → ghi tất cả trong một transaction. Nhập sao lưu dùng biến thể gộp theo `id` (giữ nguyên trường gốc, bỏ qua `id` đã có). Bản 2 quét sổ chỉ cần sinh `rows` và gọi hàm này sau màn kiểm tra.

### D9. PWA: service worker tự viết + manifest
- Sau `next build`, một script `scripts/gen-sw.mjs` quét thư mục `out/`, sinh danh sách file cần precache kèm hash phiên bản, chèn vào `sw.js`.
- Chiến lược: precache toàn bộ app shell; điều hướng trả về HTML đã cache (cache-first); không cache gì ngoài origin.
- Cập nhật: service worker mới cài ngầm và **không** `skipWaiting` — chỉ kích hoạt khi mọi tab đã đóng, tức lần mở sau. Đáp ứng spec "không tự tải lại khi đang ghi".
- *Thay thế:* Serwist/next-pwa — tiện nhưng phụ thuộc vào webpack plugin, dễ vỡ khi Next.js đổi bundler (Turbopack); app shell ở đây nhỏ và cố định nên tự viết ~80 dòng là đủ và kiểm soát được.

### D10. Giao diện: Tailwind CSS, không thư viện component
Tailwind sinh CSS tĩnh, không tốn JS lúc chạy. Font hệ thống (không tải web font). Icon là SVG nội tuyến. Không dùng thư viện animation; chuyển cảnh bằng CSS.

### D11. i18n: từ điển tự viết
Hai file `vi.ts`, `en.ts` (vài chục chuỗi), một React context cung cấp hàm `t(key)`. Ngôn ngữ lưu trong `localStorage` (đọc đồng bộ khi khởi động để tránh nháy chữ) và sao chép vào `meta`. Định dạng tiền tự viết: `n.toLocaleString('vi-VN')` + " đ", cố định cho cả hai ngôn ngữ.
- *Thay thế:* next-intl/i18next — quá nặng cho vài chục chuỗi và cần routing theo locale.

### D12. Luồng lưu + hoàn tác
Một `ToastProvider` ở layout gốc. Sau khi `addDebt/payDebt` resolve (vài ms), điều hướng `router.replace('/')` và hiện toast chứa `transactionId`; nút "Hoàn tác" gọi `voidTransaction`. Người nợ mới tạo không bị xóa khi hoàn tác; họ tự biến khỏi danh sách vì `balance = 0` (khớp spec home-screen).

### D13. Sao lưu
Định dạng JSON:
```
{ "format": "ghi-no-backup", "version": 1, "exportedAt": "...",
  "books": [...], "debtors": [...], "transactions": [...] }
```
Xuất bằng Web Share API (`navigator.share({ files })`) nếu hỗ trợ, ngược lại tải về bằng thẻ `<a download>`. Tên file: `ghi-no-YYYY-MM-DD.json`. Thời điểm xuất lưu vào `meta.lastBackupAt` để phục vụ lời nhắc sao lưu.

### D14. Kiểm thử
- Vitest: `normalizeName`, `resolveDebtor`, `parseAmount`, ledger (dùng `fake-indexeddb`), nhập/xuất sao lưu, `recomputeBalance`.
- Playwright (viewport 360x640): luồng ghi nợ người mới, ghi nợ người cũ, trừ nợ/trả hết, hoàn tác, offline (context offline sau lần tải đầu), xuất→nhập.
- Lighthouse CI với cấu hình mobile để kiểm tra ngân sách hiệu năng.

### D15. Host trên Vercel
Deploy bản xuất tĩnh (`out/`) lên Vercel. Thêm `vercel.json` đặt header `Cache-Control: no-cache` cho `/sw.js` và `/manifest.webmanifest` để trình duyệt luôn kiểm tra bản mới của service worker; các file JS/CSS có hash trong tên được cache lâu dài (`immutable`) theo mặc định.
- *Vì sao:* deploy file tĩnh miễn phí, CDN toàn cầu, preview theo từng nhánh; bản 2 cần API (đăng nhập, gọi AI quét sổ) thì dùng Vercel Functions ngay trên cùng dự án.
- *Thay thế:* Cloudflare Pages — tương đương cho file tĩnh, nhưng người dùng đã chọn Vercel.

### D16. Tên app tạm thời
Dùng tên tạm **"Sổ Nợ"** cho đến khi có tên chính thức. Tên chỉ được khai báo ở `manifest.webmanifest` và khóa `appName` trong từ điển i18n, không viết cứng ở nơi khác, để đổi tên chỉ cần sửa hai chỗ đó.

## Risks / Trade-offs

- [Safari iOS xóa dữ liệu web không dùng sau ~7 ngày] → gợi ý cài ra màn hình chính, xin lưu trữ bền vững, nhắc sao lưu định kỳ; giải quyết triệt để ở bản 2 bằng đồng bộ.
- [Mất máy / xóa dữ liệu trình duyệt] → xuất file sao lưu; bản 2 đồng bộ.
- [Cache số dư lệch với giao dịch do lỗi code] → mọi cập nhật trong cùng transaction; `recomputeBalance` sau khi nhập; test đối chiếu.
- [Service worker lỗi làm kẹt phiên bản cũ] → `sw.js` luôn phục vụ với `Cache-Control: no-cache`; có trang/đường thoát xóa cache trong menu nếu cần (mặc định ẩn).
- [Next.js 16 + React 19 đã chiếm ~130KB nén khi trang còn trống, nên ngân sách được nâng từ 120KB lên 180KB (người dùng đồng ý 26/09/2026)] → không thêm thư viện UI; đo kích thước bundle mỗi lần build; tốc độ mở lần sau dựa vào cache của service worker.
- [Gõ "50" thành 50.000 gây nhầm khi cần số lẻ như 5.500] → hiển thị trực tiếp số đầy đủ khi gõ; bản 1 chấp nhận giới hạn bội số 1.000 (hợp với cách tính ở chợ).

## Migration Plan

- Lần đầu triển khai: không có dữ liệu cũ.
- Thay đổi schema sau này dùng `db.version(n).upgrade(...)` của Dexie; không bao giờ xóa bảng cũ trong một bản phát hành.
- Rollback: triển khai lại bản tĩnh trước đó; dữ liệu IndexedDB vẫn giữ nguyên vì schema chỉ thêm, không bớt.

## Open Questions

- Tên chính thức và tên miền của app — hiện dùng tên tạm "Sổ Nợ" và tên miền mặc định của Vercel (xem D16); đổi sau chỉ ảnh hưởng manifest, từ điển i18n và biểu tượng.
