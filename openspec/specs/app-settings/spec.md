# app-settings Specification

## Purpose

Mô tả menu phụ mở từ nút `[=]` chứa các chức năng không thường xuyên như chọn ngôn ngữ và sao lưu, tách khỏi màn chính để giữ màn chính gọn và nhanh.

## Requirements

### Requirement: Menu phụ
Bấm nút `[=]` ở màn chính SHALL mở menu phụ gồm: chọn ngôn ngữ, xuất sao lưu, nhập sao lưu, "Thùng rác" kèm số người đang trong thùng rác (nếu có), hướng dẫn cài ra màn hình chính, và mục "Đăng nhập / Đồng bộ" ở trạng thái "sắp có". Menu MUST đóng được bằng nút đóng, bằng chạm ra ngoài, hoặc bằng thao tác quay lại của điện thoại. Menu SHALL trượt vào từ cạnh trái khi mở và trượt ra khi đóng, nền phía sau mờ dần tương ứng; hiệu ứng MUST bị tắt khi thiết bị bật chế độ giảm chuyển động.

#### Scenario: Mở và đóng menu
- **WHEN** người dùng bấm `[=]` rồi bấm nút quay lại của điện thoại
- **THEN** menu đóng và người dùng vẫn ở màn chính

#### Scenario: Mục đăng nhập chưa có
- **WHEN** người dùng chạm vào "Đăng nhập / Đồng bộ"
- **THEN** app thông báo tính năng sẽ có ở phiên bản sau và không chuyển trang

#### Scenario: Mở thùng rác
- **WHEN** có 2 người trong thùng rác và người dùng chạm "Thùng rác (2)" trong menu
- **THEN** màn Thùng rác mở ra với 2 người đó

### Requirement: Chọn ngôn ngữ
Hệ thống SHALL hỗ trợ Tiếng Việt và English. Ngôn ngữ mặc định MUST là Tiếng Việt. Lựa chọn ngôn ngữ MUST được lưu trên thiết bị và áp dụng ngay cho toàn bộ giao diện mà không cần tải lại. Định dạng số tiền MUST luôn dùng dấu chấm phân cách hàng nghìn và đơn vị đồng Việt Nam ở cả hai ngôn ngữ.

#### Scenario: Đổi sang English
- **WHEN** người dùng chọn English trong menu
- **THEN** các nút hiển thị "Add debt" và "Pay debt" ngay lập tức, số tiền vẫn hiển thị dạng "50.000"

#### Scenario: Giữ lựa chọn sau khi mở lại
- **WHEN** người dùng đã chọn English, đóng app rồi mở lại
- **THEN** giao diện vẫn là English
