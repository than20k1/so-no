# backup-restore Specification

## Purpose

Cho phép người dùng xuất toàn bộ sổ nợ ra một file và nhập lại trên cùng hoặc máy khác, để không mất sổ khi mất máy hay trình duyệt xóa dữ liệu trong lúc chưa có đồng bộ lên server.

## Requirements

### Requirement: Xuất file sao lưu
Menu phụ SHALL có chức năng "Xuất sao lưu" tạo một file chứa toàn bộ người nợ và giao dịch (kể cả giao dịch đã hủy), kèm phiên bản định dạng và thời điểm xuất. Tên file MUST có ngày xuất. Trên thiết bị hỗ trợ chia sẻ, hệ thống SHALL mở bảng chia sẻ để người dùng gửi file qua ứng dụng khác; nếu không hỗ trợ thì tải file về máy.

#### Scenario: Xuất sao lưu
- **WHEN** người dùng chọn "Xuất sao lưu" trong menu
- **THEN** hệ thống tạo file có tên chứa ngày hiện tại, chứa đầy đủ người nợ và giao dịch, và cho phép chia sẻ hoặc tải về

#### Scenario: Xuất khi không có mạng
- **WHEN** thiết bị không có mạng và người dùng xuất sao lưu
- **THEN** file vẫn được tạo thành công

### Requirement: Nhập file sao lưu
Menu phụ SHALL có chức năng "Nhập sao lưu". Trước khi ghi, hệ thống MUST kiểm tra định dạng file và hiển thị tóm tắt (số người, số giao dịch, số dòng đã có sẵn sẽ bỏ qua) để người dùng xác nhận. Việc nhập MUST gộp theo mã định danh: giao dịch hoặc người nợ đã có cùng mã thì bỏ qua, không tạo trùng. Giao dịch mới được nhập MUST giữ nguyên các trường gốc, bao gồm thời điểm tạo và nguồn.

#### Scenario: Nhập vào máy mới
- **WHEN** người dùng nhập file sao lưu trên một máy có sổ trống và xác nhận
- **THEN** toàn bộ người nợ, giao dịch và số dư giống hệt như lúc xuất

#### Scenario: Nhập lại cùng một file
- **WHEN** người dùng nhập một file sao lưu có các giao dịch đã tồn tại trên máy
- **THEN** không có giao dịch nào bị nhân đôi và số dư không đổi

#### Scenario: File hỏng hoặc sai định dạng
- **WHEN** người dùng chọn một file không đúng định dạng sao lưu
- **THEN** hệ thống báo lỗi dễ hiểu và không thay đổi dữ liệu hiện có

### Requirement: Nhắc sao lưu
Khi đã có giao dịch mới kể từ lần xuất sao lưu gần nhất và đã qua 7 ngày, hệ thống SHALL hiển thị một lời nhắc sao lưu nhỏ, không chặn thao tác, trong menu phụ và trên màn chính.

#### Scenario: Chưa sao lưu lâu ngày
- **WHEN** lần xuất gần nhất cách đây 8 ngày và đã có giao dịch mới sau đó
- **THEN** màn chính hiện lời nhắc sao lưu nhưng vẫn ghi/trừ nợ bình thường
