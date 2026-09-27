# Spec Delta

## MODIFIED Requirements

### Requirement: Hoạt động offline
Sau lần mở đầu tiên thành công, toàn bộ chức năng làm việc với sổ (ghi nợ, trừ nợ, xem danh sách, xem chi tiết, hoàn tác, sửa và xoá người nợ, thùng rác, khôi phục, xoá hẳn, xuất và nhập sao lưu, đổi ngôn ngữ) SHALL hoạt động khi không có mạng, kể cả khi đã đăng nhập. Khi đã đăng nhập, các chức năng Chia tiền trên nhóm đã có trên máy (xem nhóm và kết quả, tạo nhóm, thêm và sửa thành viên khách, thêm, sửa, xoá, khôi phục món, đánh dấu đã trả) SHALL cũng hoạt động khi không có mạng. Chỉ đăng ký, đăng nhập, quên mật khẩu, đồng bộ, lấy hoặc đổi link mời, vào nhóm bằng link, rời nhóm, xoá và khôi phục nhóm cần mạng; thay đổi làm lúc offline MUST được đồng bộ tự động khi có mạng trở lại.

#### Scenario: Mở app khi mất mạng
- **WHEN** thiết bị ở chế độ máy bay và người dùng mở app đã từng dùng
- **THEN** màn chính hiện ra đầy đủ dữ liệu và ghi nợ được

#### Scenario: Xoá và khôi phục khi mất mạng
- **WHEN** thiết bị ở chế độ máy bay, người dùng xoá một người rồi mở Thùng rác và khôi phục
- **THEN** cả hai thao tác thành công và người đó trở lại danh sách

#### Scenario: Đã đăng nhập nhưng mất mạng
- **WHEN** người dùng đã đăng nhập, mất mạng, ghi nợ 3 lần rồi có mạng lại
- **THEN** cả 3 lần ghi nợ đều lưu ngay trên máy và tự lên server khi có mạng

#### Scenario: Ghi món chia tiền khi mất mạng
- **WHEN** người dùng đã đăng nhập, từng mở nhóm "Đà Lạt", đang ở chế độ máy bay, mở màn Chia tiền và thêm món "Cà phê"
- **THEN** màn Chia tiền và nhóm "Đà Lạt" mở được, món được lưu và kết quả tính lại ngay, rồi món tự lên server khi có mạng
