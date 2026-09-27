# Spec Delta

## MODIFIED Requirements

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
