# Tasks

## 1. Khởi tạo dự án

- [x] 1.1 Khởi tạo Next.js (App Router, TypeScript, Tailwind) với `output: 'export'`; kiểm chứng `npm run build` sinh thư mục `out/` chứa `index.html`
- [x] 1.2 Cài `dexie`, `dexie-react-hooks`, và dev deps `vitest`, `fake-indexeddb`, `@playwright/test`; kiểm chứng `npx vitest run` và `npx playwright --version` chạy được
- [x] 1.3 Thiết lập layout gốc: font hệ thống, cột giữa tối đa 480px, meta viewport cho điện thoại, màu nền; kiểm chứng trang trống hiển thị đúng ở viewport 360x640
- [x] 1.4 Thêm script đo kích thước JS của trang `/` sau build (tổng gzip) và báo lỗi nếu vượt 180KB; kiểm chứng script in ra con số trên bản build hiện tại

## 2. Tiện ích thuần (có unit test)

- [x] 2.1 Viết `normalizeName` (NFD, bỏ dấu, `đ→d`, chữ thường, gộp khoảng trắng); kiểm chứng test "Chị Lân" → "chi lan", "  ĐỨC  " → "duc"
- [x] 2.2 Viết `parseAmount` (chuỗi số × 1.000) và `formatMoney` (dấu chấm phân cách, " đ"); kiểm chứng test "50" → 50000, "" → 0, 1200000 → "1.200.000 đ"
- [x] 2.3 Viết `resolveDebtor(input, debtors)` trả về `existing | create | ambiguous` theo spec `debt-recording`; kiểm chứng test đủ 3 trường hợp
- [x] 2.4 Viết `newId()` dùng `crypto.randomUUID` có fallback; kiểm chứng test 10.000 id không trùng

## 3. Lớp dữ liệu sổ nợ (`lib/ledger`)

- [x] 3.1 Định nghĩa schema Dexie `books`, `debtors`, `transactions`, `meta` theo design D4; tạo sổ mặc định và `deviceId` khi mở lần đầu; kiểm chứng test mở DB mới có đúng 1 sổ và 1 `deviceId`
- [x] 3.2 Cài `addDebt` (tạo người mới nếu cần) và `payDebt` trong một transaction, cập nhật `balance`, `lastTxAt`; kiểm chứng test số dư sau chuỗi ghi/trừ và các trường `direction='they_owe'`, `source='manual'`, `occurredAt = createdAt`
- [x] 3.3 Cài `voidTransaction` (đặt `voidedAt`, trừ lại số dư, không xóa dòng); kiểm chứng test số dư quay về và dòng vẫn tồn tại
- [x] 3.4 Cài `recomputeBalance` và test đối chiếu: sau 200 thao tác ngẫu nhiên, `balance` cache bằng giá trị tính lại
- [x] 3.5 Cài `importBatch(rows, source)` nguyên tử dùng `resolveDebtor`; kiểm chứng test "một dòng lỗi thì không ghi gì" và "ghép tên khi nhập hàng loạt"
- [x] 3.6 Viết hook `useDebtors()` và `useHistory(debtorId)` bọc `useLiveQuery` để giao diện không import Dexie trực tiếp; kiểm chứng bằng grep không có `from 'dexie'` trong `app/` ngoài hook
- [x] 3.7 Cài `requestPersistentStorage()` gọi sau giao dịch đầu tiên, bỏ qua lỗi khi không hỗ trợ; kiểm chứng test với `navigator.storage` bị thiếu vẫn không ném lỗi

## 4. i18n và toast

- [x] 4.1 Tạo từ điển `vi.ts`, `en.ts`, context `t(key)`, lưu ngôn ngữ vào `localStorage` và `meta`, mặc định Tiếng Việt; kiểm chứng test đổi ngôn ngữ và mở lại vẫn giữ
- [x] 4.2 Tạo `ToastProvider` với nút "Hoàn tác" hiển thị tối thiểu 5 giây; kiểm chứng test component hiện toast rồi tự ẩn sau thời gian đặt

## 5. Màn chính (`/`)

- [x] 5.1 Dựng bố cục: nút `[=]`, tổng đang được nợ, hai nút lớn (cao ≥72px), ô tìm, danh sách; kiểm chứng Playwright ở 360x640 hai nút nằm trong viewport không cần cuộn
- [x] 5.2 Danh sách người có số dư > 0 sắp theo `lastTxAt` giảm dần, chạm mở `/nguoi?id=`; kiểm chứng e2e người vừa ghi nợ lên đầu, người trả hết biến mất
- [x] 5.3 Ô tìm lọc không dấu và hiện cả người số dư 0 khi đang tìm; kiểm chứng e2e gõ "ba" ra "Cô Ba" số dư 0
- [x] 5.4 Trạng thái sổ trống hiển thị hướng dẫn; kiểm chứng e2e lần mở đầu

## 6. Ghi nợ và trừ nợ (`/ghi`, `/tru`)

- [x] 6.1 Ô tên tự focus, gợi ý tức thì (tên, ghi chú, số dư) và dòng "+ Tạo mới" ở `/ghi`; kiểm chứng e2e gõ "lan" ra "Chị Lan", "Cô Lân"
- [x] 6.2 Ô số tiền `inputMode="numeric"` hiển thị số đầy đủ khi gõ, nút nhanh 10k–500k cộng dồn, nút Lưu vô hiệu khi số tiền = 0; kiểm chứng e2e "100k"+"20k" = 120.000
- [x] 6.3 Ô ghi chú tùy chọn và ô ghi chú phân biệt cho người mới; kiểm chứng e2e lưu được khi để trống
- [x] 6.4 Lưu ở `/ghi`: gọi `addDebt` theo kết quả `resolveDebtor`, xử lý `ambiguous` bằng yêu cầu chọn; kiểm chứng e2e ba scenario "tên trùng khớp", "tên mới", "trùng khóa nhiều người"
- [x] 6.5 `/tru`: chỉ chọn người đã có, hiện số đang nợ, nút "Trả hết", cảnh báo khi trừ vượt và cho lưu bằng một lần bấm xác nhận; kiểm chứng e2e "Trả hết" đưa số dư về 0
- [x] 6.6 Nhận `?id=` để chọn sẵn người; sau khi lưu `router.replace('/')` và hiện toast "Hoàn tác"; kiểm chứng e2e bấm Hoàn tác thì số dư trở về như cũ

## 7. Chi tiết người nợ (`/nguoi?id=`)

- [x] 7.1 Hiển thị tên, ghi chú, số dư, nút "Ghi thêm"/"Trừ nợ" mở màn tương ứng đã chọn sẵn; kiểm chứng e2e từ chi tiết bấm "Trừ nợ"
- [x] 7.2 Lịch sử mới nhất ở trên, dấu +/−, ghi chú; dòng đã hủy gạch ngang kèm giờ hủy; dòng có `occurredAt` khác ngày tạo hoặc `null` hiển thị nhãn nguồn; kiểm chứng test component với dữ liệu mẫu 3 loại dòng

## 8. Menu phụ và sao lưu

- [x] 8.1 Drawer menu gắn với history (nút quay lại đóng menu), có hiệu ứng trượt vào/ra, gồm ngôn ngữ, xuất/nhập sao lưu, hướng dẫn cài, mục "Đăng nhập / Đồng bộ — sắp có"; kiểm chứng e2e mở menu rồi quay lại vẫn ở màn chính
- [x] 8.2 `exportBackup` sinh JSON theo design D13, chia sẻ qua Web Share hoặc tải về, lưu `lastBackupAt`; kiểm chứng test nội dung file đủ người nợ và giao dịch kể cả đã hủy
- [x] 8.3 Nhập sao lưu: kiểm tra định dạng, hiện tóm tắt để xác nhận, gộp theo `id`, gọi `recomputeBalance`; kiểm chứng test "nhập vào máy mới", "nhập lại cùng file không nhân đôi", "file hỏng không đổi dữ liệu"
- [x] 8.4 Lời nhắc sao lưu khi >7 ngày và có giao dịch mới; kiểm chứng test với đồng hồ giả lập

## 9. PWA và offline

- [x] 9.1 Thêm `manifest.webmanifest` (tên tạm "Sổ Nợ" lấy từ khóa `appName` của i18n, `display: standalone`, biểu tượng 192/512, màu) và thẻ Apple; kiểm chứng Lighthouse báo installable
- [x] 9.2 Viết `scripts/gen-sw.mjs` sinh danh sách precache từ `out/` và `sw.js` cache-first, không `skipWaiting`; nối vào `npm run build`; kiểm chứng `out/sw.js` chứa danh sách file và hash phiên bản
- [x] 9.3 Đăng ký service worker sau khi trang tải xong; kiểm chứng e2e: tải lần đầu, chuyển context sang offline, tải lại thấy màn chính và ghi nợ được
- [x] 9.4 Gợi ý cài ra màn hình chính nằm trong menu, nút `[=]` có chấm báo (Android dùng `beforeinstallprompt`, iPhone hiện hướng dẫn "Chia sẻ → Thêm vào Màn hình chính"), chỉ hiện khi chưa cài và đã có giao dịch, đóng được; kiểm chứng e2e giả lập user agent iPhone
- [x] 9.5 Tạo `vercel.json` đặt `Cache-Control: no-cache` cho `/sw.js` và `/manifest.webmanifest`; kiểm chứng bằng `curl -I` trên bản deploy thấy đúng header

## 10. Kiểm tra tổng thể

- [x] 10.1 Chạy Lighthouse mobile (Slow 4G, CPU chậm 4 lần) trên bản build: nút lớn bấm được ≤2s lần đầu, ≤1s lần sau, JS trang `/` ≤180KB nén; ghi kết quả vào README
- [ ] 10.2 Deploy bản build lên Vercel (tên miền mặc định `*.vercel.app`); kiểm chứng mở được bằng HTTPS trên điện thoại và cài được ra màn hình chính
- [ ] 10.3 Chạy toàn bộ `vitest` và `playwright` xanh; thử tay trên bản deploy Vercel với một điện thoại Android thật và một iPhone (ghi nợ người mới, trừ nợ, hoàn tác, offline)
- [x] 10.4 Chạy `openspec validate ghi-no-ban-1 --strict` không lỗi
