# Spec Delta

## MODIFIED Requirements

### Requirement: Xuất file sao lưu
Menu phụ SHALL có chức năng "Xuất sao lưu" tạo một file chứa toàn bộ người nợ (kể cả người đã xoá và đã xoá hẳn, kèm thời điểm xoá), toàn bộ giao dịch (kể cả giao dịch đã hủy) và toàn bộ lịch sử sửa, kèm phiên bản định dạng và thời điểm xuất. Tên file MUST có ngày xuất. Trên thiết bị hỗ trợ chia sẻ, hệ thống SHALL mở bảng chia sẻ để người dùng gửi file qua ứng dụng khác; nếu không hỗ trợ thì tải file về máy.

#### Scenario: Xuất sao lưu
- **WHEN** người dùng chọn "Xuất sao lưu" trong menu
- **THEN** hệ thống tạo file có tên chứa ngày hiện tại, chứa đầy đủ người nợ, giao dịch và lịch sử sửa, và cho phép chia sẻ hoặc tải về

#### Scenario: Xuất khi không có mạng
- **WHEN** thiết bị không có mạng và người dùng xuất sao lưu
- **THEN** file vẫn được tạo thành công

### Requirement: Nhập file sao lưu
Menu phụ SHALL có chức năng "Nhập sao lưu". Trước khi ghi, hệ thống MUST kiểm tra định dạng file và hiển thị tóm tắt (số người, số giao dịch, số dòng đã có sẵn sẽ bỏ qua) để người dùng xác nhận. Việc nhập MUST gộp theo mã định danh: giao dịch, người nợ hoặc sự kiện lịch sử sửa đã có cùng mã thì bỏ qua, không tạo trùng. Dữ liệu mới được nhập MUST giữ nguyên các trường gốc, bao gồm thời điểm tạo, nguồn và trạng thái xoá. Hệ thống MUST nhập được cả file sao lưu tạo từ bản trước (không có lịch sử sửa và trạng thái xoá), coi mọi người nợ trong đó là chưa xoá.

#### Scenario: Nhập vào máy mới
- **WHEN** người dùng nhập file sao lưu trên một máy có sổ trống và xác nhận
- **THEN** toàn bộ người nợ, giao dịch, lịch sử sửa, trạng thái xoá và số dư giống hệt như lúc xuất

#### Scenario: Nhập lại cùng một file
- **WHEN** người dùng nhập một file sao lưu có các giao dịch đã tồn tại trên máy
- **THEN** không có giao dịch nào bị nhân đôi và số dư không đổi

#### Scenario: File hỏng hoặc sai định dạng
- **WHEN** người dùng chọn một file không đúng định dạng sao lưu
- **THEN** hệ thống báo lỗi dễ hiểu và không thay đổi dữ liệu hiện có

#### Scenario: Nhập file từ bản cũ
- **WHEN** người dùng nhập file sao lưu xuất từ bản trước
- **THEN** người nợ và giao dịch được nhập đầy đủ, tất cả người nợ ở trạng thái chưa xoá
