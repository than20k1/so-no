# Spec Delta

## MODIFIED Requirements

### Requirement: Menu phụ
Bấm nút `[=]` ở màn chính SHALL mở menu phụ gồm: mục tài khoản, chọn ngôn ngữ, xuất sao lưu, nhập sao lưu, "Thùng rác" kèm số người đang trong thùng rác (nếu có), và hướng dẫn cài ra màn hình chính. Khi chưa đăng nhập, mục tài khoản SHALL là "Đăng nhập / Đồng bộ" và mở màn đăng nhập. Khi đã đăng nhập, mục tài khoản SHALL hiển thị số điện thoại, trạng thái đồng bộ, nút "Đồng bộ ngay" và "Đăng xuất". Menu MUST đóng được bằng nút đóng, bằng chạm ra ngoài, hoặc bằng thao tác quay lại của điện thoại. Menu SHALL trượt vào từ cạnh trái khi mở và trượt ra khi đóng, nền phía sau mờ dần tương ứng; hiệu ứng MUST bị tắt khi thiết bị bật chế độ giảm chuyển động.

#### Scenario: Mở và đóng menu
- **WHEN** người dùng bấm `[=]` rồi bấm nút quay lại của điện thoại
- **THEN** menu đóng và người dùng vẫn ở màn chính

#### Scenario: Mục đăng nhập chưa có
- **WHEN** người dùng chưa đăng nhập (máy chưa có tài khoản) chạm vào "Đăng nhập / Đồng bộ"
- **THEN** màn đăng nhập mở ra thay cho thông báo "sắp có", có đường sang đăng ký và quên mật khẩu

#### Scenario: Đã đăng nhập
- **WHEN** người dùng đã đăng nhập mở menu
- **THEN** menu hiển thị số điện thoại của tài khoản, thời điểm đồng bộ gần nhất, nút "Đồng bộ ngay" và "Đăng xuất"

#### Scenario: Mở thùng rác
- **WHEN** có 2 người trong thùng rác và người dùng chạm "Thùng rác (2)" trong menu
- **THEN** màn Thùng rác mở ra với 2 người đó
