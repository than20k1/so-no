# Proposal

## Why

Bản 1 chỉ ghi thêm được mà không sửa hay bỏ được người nợ: gõ sai tên thì phải sống chung với tên sai, người đã nghỉ mua vẫn nằm mãi trong gợi ý. Người bán cần sửa tên và dọn sổ, nhưng vì đây là sổ nợ (chứng cứ khi có tranh cãi) nên mọi thay đổi phải có dấu vết, xoá phải lấy lại được, và dữ liệu không bao giờ thực sự mất. Đồng thời app cần biểu tượng riêng dễ nhận ra hơn chữ "Nợ" tạm thời. Làm phần này trước change đăng nhập/đồng bộ để dữ liệu đã có sẵn dạng đồng bộ được.

## What Changes

- **Sửa người nợ**: sửa tên và ghi chú phân biệt từ màn chi tiết. Được đặt tên trùng người khác (chỉ cảnh báo, không chặn).
- **Lịch sử sửa**: mỗi lần sửa, xoá, khôi phục, xoá hẳn sinh một sự kiện mới chỉ ghi thêm (giá trị trước/sau, thời điểm, mã thiết bị); màn chi tiết hiển thị lịch sử này.
- **Xoá mềm + Thùng rác**: xoá được mọi người nợ (kể cả còn nợ), có xác nhận và nút "Hoàn tác". Người đã xoá bị ẩn khỏi danh sách, tổng tiền, tìm kiếm và gợi ý tên; nằm trong màn "Thùng rác" mới (mở từ menu).
  - Ngày 0–15 sau khi xoá: chỉ khôi phục được, không thể "xoá hẳn".
  - Ngày 15–30: được bấm "Xoá hẳn".
  - Từ ngày 30: app tự xoá hẳn khi mở.
- **"Xoá hẳn" = ẩn vĩnh viễn, không xoá dữ liệu**: người nợ, giao dịch và lịch sử sửa vẫn nằm trong máy và trong file sao lưu, để admin khôi phục khi cần (công cụ admin làm ở change đồng bộ).
- **Sao lưu định dạng phiên bản 2**: file có thêm lịch sử sửa và trạng thái xoá; vẫn nhập được file phiên bản 1.
- **Icon mới**: cuốn sổ + dấu mộc "NỢ" (mẫu E2, `assets/icon.svg`), kèm bản maskable có lề an toàn.

## Capabilities

### New Capabilities
- `debtor-management`: sửa tên/ghi chú người nợ, lịch sử sửa, xoá mềm, thùng rác, khôi phục, xoá hẳn thủ công và tự động theo mốc 15/30 ngày.

### Modified Capabilities
- `debt-ledger`: dữ liệu người nợ thêm trạng thái xoá/xoá hẳn; "xoá hẳn" không bao giờ xoá vật lý dữ liệu.
- `home-screen`: danh sách, tổng tiền và tìm kiếm bỏ qua người đã xoá.
- `debt-recording`: gợi ý tên và ghép tên trùng khớp bỏ qua người đã xoá.
- `debtor-history`: màn chi tiết có lối vào "Sửa" và hiển thị lịch sử sửa.
- `app-settings`: menu phụ thêm mục "Thùng rác".
- `backup-restore`: file sao lưu chứa lịch sử sửa và trạng thái xoá; nhập được cả phiên bản cũ.
- `offline-app-shell`: các chức năng sửa/xoá/thùng rác cũng chạy offline.

## Impact

- `lib/ledger/types.ts`, `db.ts` (Dexie version 2: bảng `debtorEvents`, trường `deletedAt`/`purgedAt`), `ledger.ts` (sửa/xoá/khôi phục/xoá hẳn/tự xoá hẳn), `backup.ts` (định dạng v2), `hooks.ts`.
- Giao diện: `DebtorDetail.tsx` (nút Sửa, lịch sử sửa), bảng sửa mới (tải lười), trang mới `app/thung-rac/`, `Menu.tsx`, `HomeScreen.tsx`, `DebtForm.tsx` (lọc người đã xoá), từ điển vi/en.
- Icon: `scripts/gen-icons.mjs` dựng PNG từ `scripts/icon.svg`; `app/manifest.ts` dùng icon maskable riêng.
- Không thêm thư viện. Màn chính gần như không tăng JS (bảng sửa và thùng rác tải riêng); ngân sách 180KB giữ nguyên.
- Người dùng hiện có: dữ liệu cũ được nâng cấp tự động, không mất gì.
