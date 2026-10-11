## MODIFIED Requirements

### Requirement: Cập nhật phiên bản không làm gián đoạn
Khi có phiên bản app mới, hệ thống SHALL tải ngầm bản mới và kiểm tra bản mới mỗi lần app được mở hoặc quay lại từ nền. Khi bản mới đã tải xong:
- Nếu người dùng đang ở màn chính Ghi nợ hoặc màn danh sách Chia tiền, không mở form hay hộp thoại nào, và app vừa được mở hoặc vừa quay lại từ nền, hệ thống SHALL áp dụng bản mới ngay (tải lại trang một lần).
- Ở mọi trường hợp khác, hệ thống SHALL hiện thanh "Có bản mới — Cập nhật"; bấm Cập nhật MUST áp dụng bản mới và tải lại trang.

Hệ thống MUST NOT tự tải lại trang khi người dùng đang ở giữa một thao tác nhập liệu (ghi nợ, trừ nợ, thêm hoặc sửa chi tiêu, sửa người nợ, tạo nhóm). Tải lại trang (kể cả nhiều lần) MUST NOT khiến người dùng kẹt ở bản cũ khi bản mới đã tải xong và đã được áp dụng. Trong một phiên, mọi màn MUST chạy cùng một phiên bản; chuyển giữa các màn MUST NOT đưa người dùng về phiên bản khác.

#### Scenario: Có bản mới khi đang ghi nợ
- **WHEN** có phiên bản mới trong lúc người dùng đang nhập số tiền
- **THEN** màn hình không bị tải lại, dữ liệu đang nhập không mất, và thanh "Có bản mới — Cập nhật" hiện ra

#### Scenario: Mở app khi đã có bản mới
- **WHEN** bản mới đã được tải ngầm, người dùng mở app (hoặc quay lại app từ nền) và đang ở màn chính
- **THEN** app tự tải lại một lần và chạy bản mới

#### Scenario: Bấm Cập nhật
- **WHEN** thanh "Có bản mới — Cập nhật" đang hiện và người dùng bấm Cập nhật
- **THEN** trang tải lại và chạy bản mới; tải lại thêm lần nữa vẫn là bản mới

#### Scenario: Không nhảy về bản cũ khi chuyển màn
- **WHEN** đã deploy bản mới có thêm màn mới, người dùng đang dùng app rồi chuyển qua lại giữa màn cũ và màn mới
- **THEN** mọi màn đều chạy cùng một phiên bản (không có màn nào mất đi tính năng của bản đang chạy)

## ADDED Requirements

### Requirement: Xem phiên bản và kiểm tra bản mới
Menu phụ SHALL hiển thị mã phiên bản app đang chạy và nút "Kiểm tra bản mới". Bấm nút MUST hỏi server có bản mới không: nếu có, tải bản mới rồi hiện thanh "Có bản mới — Cập nhật"; nếu không, báo "Đang dùng bản mới nhất"; nếu không có mạng, báo cần kết nối.

#### Scenario: Kiểm tra khi đã mới nhất
- **WHEN** người dùng mở menu và bấm "Kiểm tra bản mới" khi máy đã ở bản mới nhất
- **THEN** app báo "Đang dùng bản mới nhất" và hiện mã phiên bản

#### Scenario: Kiểm tra khi mất mạng
- **WHEN** thiết bị offline và người dùng bấm "Kiểm tra bản mới"
- **THEN** app báo cần kết nối mạng, app vẫn dùng bình thường
