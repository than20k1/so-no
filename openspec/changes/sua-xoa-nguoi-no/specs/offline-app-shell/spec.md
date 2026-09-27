# Spec Delta

## MODIFIED Requirements

### Requirement: Hoạt động offline
Sau lần mở đầu tiên thành công, toàn bộ chức năng của app (ghi nợ, trừ nợ, xem danh sách, xem chi tiết, hoàn tác, sửa và xoá người nợ, thùng rác, khôi phục, xoá hẳn, xuất và nhập sao lưu, đổi ngôn ngữ) SHALL hoạt động khi không có mạng.

#### Scenario: Mở app khi mất mạng
- **WHEN** thiết bị ở chế độ máy bay và người dùng mở app đã từng dùng
- **THEN** màn chính hiện ra đầy đủ dữ liệu và ghi nợ được

#### Scenario: Xoá và khôi phục khi mất mạng
- **WHEN** thiết bị ở chế độ máy bay, người dùng xoá một người rồi mở Thùng rác và khôi phục
- **THEN** cả hai thao tác thành công và người đó trở lại danh sách
