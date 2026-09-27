# Tasks

## 1. Dữ liệu

- [x] 1.1 Thêm `deletedAt`, `purgedAt` vào `Debtor` và kiểu `DebtorEvent` trong `lib/ledger/types.ts`; tạo người nợ mới gán `null` cho cả hai. Kiểm tra: `npx tsc --noEmit` sạch
- [x] 1.2 Thêm Dexie version 2 (bảng `debtorEvents`, upgrade gán `null` cho người nợ cũ). Kiểm tra: unit test mở DB version 1 có sẵn dữ liệu rồi nâng lên version 2, người nợ cũ có `deletedAt === null` và vẫn đọc được
- [x] 1.3 Viết `trashState(deletedAt, now)` với mốc 15/30 ngày. Kiểm tra: unit test ở các mốc 14 ngày 23 giờ, đúng 15 ngày, 29 ngày, đúng 30 ngày
- [x] 1.4 Viết `editDebtor` (làm sạch tên, tên trống → lỗi, cập nhật `searchKey`/`updatedAt`, ghi sự kiện `edit`; không đổi gì → không ghi). Kiểm tra: unit test đổi tên, đổi ghi chú, tên trống, lưu không đổi gì, số dư giữ nguyên
- [x] 1.5 Viết `deleteDebtor`, `restoreDebtor`, `purgeDebtor` (chặn khi chưa đủ 15 ngày), `purgeExpired(now)`, `listTrash()`; mỗi thao tác ghi sự kiện trong cùng transaction. Kiểm tra: unit test đủ vòng xoá → khôi phục → xoá → xoá hẳn, chặn xoá hẳn ở ngày 14, tự xoá hẳn ở ngày 30, giao dịch và sự kiện vẫn còn sau khi xoá hẳn
- [x] 1.6 Lọc người đã xoá: `listDebtors` chỉ trả người chưa xoá; `getDebtor` trả `undefined` với người đã xoá hẳn; `addDebt`/`payDebt`/`editDebtor` từ chối người đã xoá (`debtor_deleted`); `importBatch` ghép tên bỏ qua người đã xoá. Kiểm tra: unit test ghi nợ bằng tên trùng người trong thùng rác → tạo người mới; ghi nợ bằng id người đã xoá → lỗi
- [x] 1.7 Thêm hook `useTrash`, `useTrashCount`, `useDebtorEvents` vào `lib/ledger/hooks.ts` (chỉ đọc) và export từ `lib/ledger/index.ts`. Kiểm tra: `npx tsc --noEmit` sạch
- [x] 1.8 Gọi `purgeExpired()` trong effect của `Providers` sau `getContext()`, bắt lỗi im lặng. Kiểm tra: test trong `components/providers.test.tsx`, người bị xoá 31 ngày trước biến khỏi thùng rác sau khi render

## 2. Sao lưu version 2

- [x] 2.1 `buildBackup` xuất version 2 kèm `debtorEvents` và trạng thái xoá của mọi người nợ (kể cả đã xoá hẳn). Kiểm tra: unit test file xuất có người đã xoá hẳn, đủ giao dịch và sự kiện
- [x] 2.2 `parseBackup` nhận version 1 và 2 (version 1: không có sự kiện, người nợ coi là chưa xoá); `applyBackupImport` gộp sự kiện theo id, người nợ đã có vẫn bỏ qua. Kiểm tra: unit test nhập file version 1; nhập file version 2 vào máy trống ra dữ liệu giống hệt; nhập lại cùng file không nhân đôi sự kiện

## 3. Giao diện

- [x] 3.1 Thêm chuỗi vi/en cho sửa, xoá, xác nhận, thùng rác, khôi phục, xoá hẳn, lịch sử sửa, mốc ngày, cảnh báo trùng tên. Kiểm tra: `npx tsc --noEmit` sạch (kiểu `Dict` bắt thiếu key ở `en.ts`)
- [x] 3.2 Tạo `DebtorEditSheet` (tải lười từ màn chi tiết): sửa tên/ghi chú, cảnh báo trùng tên không chặn lưu, nút "Xoá người này" với bước xác nhận nêu số dư; xoá xong về màn chính và hiện thông báo "Đã xoá …" kèm "Hoàn tác" (gọi khôi phục). Kiểm tra: e2e đổi tên rồi thấy tên mới ở màn chính và trong gợi ý; e2e xoá rồi hoàn tác
- [x] 3.3 Màn chi tiết: nút "Sửa" ở header; khi người đang trong thùng rác thì hiện "Đã xoá ngày …" + "Khôi phục" thay cho các nút ghi/trừ/sửa; thêm mục lịch sử sửa (mới nhất ở trên, dòng cuối "Tạo ngày …"). Kiểm tra: unit test render lịch sử sửa; e2e mở người trong thùng rác thấy nút Khôi phục và không có nút Ghi thêm
- [x] 3.4 Trang `app/thung-rac/page.tsx`: danh sách người đã xoá với ngày xoá, số ngày trước khi tự xoá hẳn, nút Khôi phục, nút Xoá hẳn (vô hiệu kèm ngày được phép khi chưa đủ 15 ngày, có xác nhận khi đủ); chạy `purgeExpired()` khi mở trang. Kiểm tra: e2e dùng `page.clock` tua 14 ngày thấy Xoá hẳn bị vô hiệu, tua 16 ngày xoá hẳn được, tua 31 ngày người đó tự biến mất
- [x] 3.5 Menu: mục "Thùng rác (n)" mở `/thung-rac/`. Kiểm tra: e2e xoá 2 người thì menu hiện "Thùng rác (2)" và bấm vào mở đúng trang
- [x] 3.6 Kiểm tra màn chính, ô tìm và gợi ý tên không có người đã xoá, tổng tiền không tính họ. Kiểm tra: e2e xoá người còn nợ 150.000 thì tổng giảm 150.000; gõ tên người đó ở ô tìm và ở màn Ghi nợ không ra gợi ý

## 4. Icon

- [x] 4.1 Chép `openspec/changes/sua-xoa-nguoi-no/assets/icon.svg` thành `scripts/icon.svg`; sửa `scripts/gen-icons.mjs` để dựng từ SVG ra `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `icon-32.png` và `icon-maskable-512.png` (hình thu 80% trên nền đỏ). Kiểm tra: chạy `node scripts/gen-icons.mjs`, mở các PNG thấy đúng mẫu E2, bản maskable có lề
- [x] 4.2 `app/manifest.ts` dùng `icon-maskable-512.png` cho `maskable`; `app/layout.tsx` thêm favicon 32px. Kiểm tra: sau `npm run build`, `out/manifest.webmanifest` trỏ đúng file và các PNG có trong `out/`

## 5. Kiểm tra tổng

- [x] 5.1 `npm test` và `npm run lint` đều qua
- [x] 5.2 `npm run build` qua kiểm tra ngân sách JS màn chính ≤ 180KB (bảng sửa và trang thùng rác không nằm trong bundle `/`)
- [x] 5.3 `npm run test:e2e` qua toàn bộ, kể cả e2e offline: chặn mạng, xoá rồi khôi phục một người thành công
- [x] 5.4 Nâng cấp dữ liệu thật: mở bản build mới trên trình duyệt đang có sổ từ bản cũ, danh sách và số dư giữ nguyên; xuất sao lưu ra file version 2
- [x] 5.5 Cập nhật `README.md` (trỏ spec về `openspec/specs/`, thêm mục icon và thùng rác). Kiểm tra: đọc lại README khớp lệnh và cấu trúc thư mục
