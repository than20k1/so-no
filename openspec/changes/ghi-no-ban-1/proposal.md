# Proposal

## Why

Người bán ở chợ đang ghi nợ bằng sổ giấy: dễ thất lạc, khó tra cứu, và khi khách cãi thì không có bằng chứng rõ ràng. Một app ghi nợ chỉ thay được cuốn sổ nếu thao tác **nhanh hơn viết tay** — mở app gần như tức thì, ghi/trừ nợ trong vài giây, chạy được cả khi sóng yếu hoặc mất mạng ở chợ.

## What Changes

- Tạo mới ứng dụng web Next.js, tối ưu cho màn hình điện thoại, cài được như PWA và hoạt động hoàn toàn offline.
- Lưu dữ liệu local-first trong IndexedDB (Dexie.js); bản 1 không có server, không bắt buộc đăng nhập.
- Màn chính gồm: nút menu `[=]`, hai nút lớn **Ghi nợ** / **Trừ nợ**, và bên dưới là ô tìm + danh sách người đang nợ.
- Luồng **Ghi nợ**: ô tên tự focus, gợi ý tên cũ (tìm không dấu, không phân biệt hoa thường), tên trùng khớp tự gắn vào người cũ, dòng "+ Tạo mới" luôn hiển thị; nhập tiền kiểu chợ ("50" = 50.000) và nút số tiền nhanh.
- Luồng **Trừ nợ**: chỉ chọn người đã có, hiển thị số đang nợ, có nút "Trả hết".
- Lưu ngay không hỏi xác nhận; hiện toast kèm nút **Hoàn tác**.
- Sổ nợ dạng **ghi thêm, không tẩy xóa**: mỗi lần ghi/trừ là một giao dịch có thời gian do app tự ghi; hoàn tác là đánh dấu hủy (vẫn hiển thị gạch ngang) để làm chứng cứ minh bạch.
- Màn chi tiết người nợ: số dư hiện tại và lịch sử từng dòng.
- Menu phụ: chọn ngôn ngữ (Tiếng Việt, English), xuất/nhập file sao lưu.
- Xin quyền lưu trữ bền vững và gợi ý người dùng cài app ra màn hình chính để giảm rủi ro mất dữ liệu.
- Chuẩn bị sẵn mô hình dữ liệu cho các bản sau (đồng bộ, nhiều người cùng sổ, nợ hai chiều, quét sổ giấy): UUID, `so_id`, `chieu`, `nguon`, `ngay_xay_ra` tách khỏi `tao_luc`, và một đường nhập hàng loạt dùng chung.

### Ngoài phạm vi (Non-goals)

- Đăng nhập, server, đồng bộ nhiều thiết bị (bản 2).
- **Quét sổ giấy bằng máy ảnh + AI** để nhập danh sách nợ (bản 2, ưu tiên cao) — bản 1 chỉ chuẩn bị dữ liệu và đường nhập chung.
- Nhiều người cùng ghi một sổ; ghi nợ hai chiều ("mình nợ người khác"); gửi lịch sử cho khách dạng ảnh.

## Capabilities

### New Capabilities
- `debt-ledger`: Mô hình sổ nợ ghi thêm (người nợ, giao dịch), tính số dư, hoàn tác bằng đánh dấu hủy, các trường chuẩn bị cho bản sau, và đường nhập hàng loạt dùng chung.
- `debt-recording`: Luồng ghi nợ và trừ nợ: gợi ý/ghép tên, tạo người mới, nhập số tiền kiểu chợ, lưu tức thì kèm hoàn tác.
- `home-screen`: Màn chính với menu, hai nút lớn và danh sách người đang nợ có ô tìm kiếm.
- `debtor-history`: Màn chi tiết một người: số dư, lịch sử giao dịch, hiển thị dòng đã hủy.
- `backup-restore`: Xuất toàn bộ sổ ra file và nhập lại từ file.
- `offline-app-shell`: PWA, tải nhanh, hoạt động offline, lưu trữ bền vững, gợi ý cài ra màn hình chính.
- `app-settings`: Menu phụ và chọn ngôn ngữ (vi/en).

### Modified Capabilities
<!-- Không có: dự án chưa có spec nào. -->

## Impact

- Dự án mới hoàn toàn: khởi tạo Next.js (App Router, TypeScript), không có code cũ bị ảnh hưởng.
- Phụ thuộc mới: `next`, `react`, `dexie`, thư viện/cấu hình PWA (service worker), công cụ i18n nhẹ.
- Không có API hay server ở bản 1; toàn bộ dữ liệu nằm trên thiết bị người dùng.
- Rủi ro chính: mất dữ liệu khi trình duyệt dọn bộ nhớ hoặc mất máy — giảm thiểu bằng lưu trữ bền vững, cài PWA và sao lưu file.
