# Spec Delta

## Purpose

Cho phép sửa tên, ghi chú và xoá người nợ một cách an toàn: mọi thay đổi đều để lại dấu vết, người bị xoá nằm trong thùng rác theo mốc 15/30 ngày, và dữ liệu không bao giờ bị xoá thật để luôn khôi phục được.

## ADDED Requirements

### Requirement: Sửa tên và ghi chú người nợ
Từ màn chi tiết, người dùng SHALL sửa được tên hiển thị và ghi chú phân biệt của một người nợ chưa bị xoá. Tên sau khi sửa MUST không trống. Khóa tìm kiếm MUST được cập nhật theo tên mới ngay khi lưu. Nếu tên mới trùng khóa tìm kiếm với người khác chưa bị xoá, hệ thống SHALL hiển thị cảnh báo nhưng MUST vẫn cho lưu. Sửa người nợ MUST NOT thay đổi giao dịch hay số dư của người đó.

#### Scenario: Sửa tên gõ sai
- **WHEN** người dùng sửa tên "Chi Lan" thành "Chị Lan rau" rồi lưu
- **THEN** màn chi tiết, danh sách và gợi ý tên hiển thị "Chị Lan rau", số dư không đổi, và gõ "lan rau" khi ghi nợ sẽ gợi ý người này

#### Scenario: Tên trống
- **WHEN** người dùng xoá hết tên rồi bấm lưu
- **THEN** hệ thống không lưu và báo tên không được để trống

#### Scenario: Trùng tên người khác
- **WHEN** sổ đã có "Cô Ba" và người dùng đổi tên "Ba cá" thành "cô ba"
- **THEN** hệ thống cảnh báo đã có người tên này nhưng vẫn lưu được khi người dùng bấm lưu

### Requirement: Lịch sử sửa chỉ ghi thêm
Mỗi thao tác sửa, xoá, khôi phục và xoá hẳn một người nợ SHALL tạo một sự kiện mới gồm mã định danh duy nhất toàn cục, loại thao tác, giá trị trước và sau (với thao tác sửa), thời điểm và mã thiết bị. Hệ thống MUST NOT sửa hay xoá sự kiện đã ghi. Màn chi tiết SHALL hiển thị lịch sử sửa, mới nhất ở trên, cùng thời điểm tạo người nợ.

#### Scenario: Xem lịch sử đổi tên
- **WHEN** người dùng đổi tên "Chi Lan" thành "Chị Lan" ngày 27/09 rồi mở màn chi tiết
- **THEN** mục lịch sử sửa có dòng "27/09 đổi tên: Chi Lan → Chị Lan" và dòng thời điểm tạo người nợ

#### Scenario: Sửa không đổi gì
- **WHEN** người dùng mở bảng sửa rồi lưu mà không thay đổi tên hay ghi chú
- **THEN** không có sự kiện mới nào được ghi

### Requirement: Xoá người nợ vào thùng rác
Người dùng SHALL xoá được bất kỳ người nợ chưa bị xoá nào, kể cả người còn số dư, sau một bước xác nhận có nêu số dư hiện tại. Sau khi xoá, hệ thống MUST quay về màn chính và hiển thị thông báo kèm nút "Hoàn tác" khôi phục ngay người vừa xoá. Người đã xoá MUST NOT xuất hiện trong danh sách, tổng tiền, kết quả tìm kiếm và gợi ý tên, và MUST xuất hiện trong màn "Thùng rác" kèm số ngày còn lại trước khi tự xoá hẳn. Giao dịch của người đã xoá MUST được giữ nguyên.

#### Scenario: Xoá người còn nợ
- **WHEN** người dùng xoá "Anh Tú" đang nợ 150.000 và xác nhận
- **THEN** "Anh Tú" biến mất khỏi màn chính, tổng tiền giảm 150.000, và "Anh Tú" nằm trong Thùng rác

#### Scenario: Hoàn tác xoá
- **WHEN** người dùng bấm "Hoàn tác" trên thông báo vừa xoá "Anh Tú"
- **THEN** "Anh Tú" trở lại danh sách với số dư và lịch sử như trước

### Requirement: Khôi phục từ thùng rác
Người dùng SHALL khôi phục được người nợ trong thùng rác (chưa bị xoá hẳn) bất cứ lúc nào. Người được khôi phục MUST trở lại đầy đủ với tên, ghi chú, giao dịch và số dư như trước khi xoá. Người đang trong thùng rác MUST NOT sửa được và MUST NOT ghi hay trừ nợ được cho đến khi được khôi phục.

#### Scenario: Khôi phục sau 10 ngày
- **WHEN** "Anh Tú" đã bị xoá 10 ngày và người dùng bấm "Khôi phục" trong Thùng rác
- **THEN** "Anh Tú" trở lại danh sách người đang nợ với số dư cũ

### Requirement: Mốc 15 và 30 ngày
Tính từ lúc xoá: trong 15 ngày đầu, hệ thống MUST NOT cho phép xoá hẳn và SHALL hiển thị ngày sớm nhất được xoá hẳn; từ đủ 15 ngày, người dùng SHALL xoá hẳn được sau một bước xác nhận; khi đủ 30 ngày, hệ thống SHALL tự xoá hẳn người đó vào lần mở app kế tiếp mà không cần người dùng thao tác.

#### Scenario: Chưa đủ 15 ngày
- **WHEN** "Anh Tú" bị xoá được 14 ngày và người dùng mở Thùng rác
- **THEN** không có nút xoá hẳn khả dụng cho "Anh Tú" và màn hình cho biết ngày được phép xoá hẳn

#### Scenario: Xoá hẳn thủ công
- **WHEN** "Anh Tú" bị xoá được 16 ngày, người dùng bấm "Xoá hẳn" và xác nhận
- **THEN** "Anh Tú" biến mất khỏi Thùng rác

#### Scenario: Tự xoá hẳn
- **WHEN** "Anh Tú" bị xoá đã 31 ngày và người dùng mở app
- **THEN** "Anh Tú" không còn trong Thùng rác

### Requirement: Xoá hẳn không xoá dữ liệu
Xoá hẳn SHALL chỉ đánh dấu người nợ là đã xoá hẳn để ẩn khỏi mọi màn hình, kể cả Thùng rác. Hệ thống MUST NOT xoá vật lý người nợ, giao dịch hay lịch sử sửa của người đó khỏi thiết bị, và MUST đưa đầy đủ dữ liệu này vào file sao lưu để có thể khôi phục bằng công cụ quản trị.

#### Scenario: Dữ liệu vẫn còn trong sao lưu
- **WHEN** "Anh Tú" đã bị xoá hẳn và người dùng xuất sao lưu
- **THEN** file sao lưu vẫn chứa "Anh Tú", toàn bộ giao dịch và lịch sử sửa, kèm thời điểm xoá và xoá hẳn

#### Scenario: Mở trực tiếp người đã xoá hẳn
- **WHEN** người dùng mở đường dẫn chi tiết của một người đã xoá hẳn
- **THEN** app báo không tìm thấy người này
