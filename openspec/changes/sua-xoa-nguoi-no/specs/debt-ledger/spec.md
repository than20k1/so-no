# Spec Delta

## MODIFIED Requirements

### Requirement: Dữ liệu người nợ
Mỗi người nợ SHALL có mã định danh duy nhất toàn cục, thuộc về một sổ, có tên hiển thị, ghi chú phân biệt tùy chọn, một khóa tìm kiếm là tên đã bỏ dấu tiếng Việt và chuyển về chữ thường, thời điểm xoá (để trống nếu chưa xoá) và thời điểm xoá hẳn (để trống nếu chưa xoá hẳn). Người nợ có dữ liệu từ bản trước MUST được coi là chưa xoá.

#### Scenario: Khóa tìm kiếm bỏ dấu
- **WHEN** tạo người nợ tên "Chị Lân"
- **THEN** khóa tìm kiếm của người đó là "chi lan"

#### Scenario: Dữ liệu cũ sau khi cập nhật app
- **WHEN** người dùng có sổ từ bản trước mở app bản mới
- **THEN** mọi người nợ cũ vẫn hiển thị bình thường với thời điểm xoá để trống

### Requirement: Sổ nợ chỉ ghi thêm
Hệ thống SHALL lưu mỗi lần ghi nợ hoặc trừ nợ thành một giao dịch mới. Hệ thống MUST NOT sửa số tiền, người nợ hay thời gian của một giao dịch đã lưu, và MUST NOT xóa vĩnh viễn giao dịch hay người nợ trong bất kỳ luồng sử dụng nào, kể cả khi người dùng "xoá hẳn" một người nợ.

#### Scenario: Trừ nợ tạo dòng mới
- **WHEN** người dùng trừ 100.000 cho "Chị Lan" đang nợ 250.000
- **THEN** hệ thống thêm một giao dịch trừ 100.000 và các giao dịch cũ của "Chị Lan" giữ nguyên

#### Scenario: Xoá hẳn vẫn giữ giao dịch
- **WHEN** người dùng xoá hẳn "Chị Lan" có 5 giao dịch
- **THEN** 5 giao dịch đó vẫn được lưu trên thiết bị
