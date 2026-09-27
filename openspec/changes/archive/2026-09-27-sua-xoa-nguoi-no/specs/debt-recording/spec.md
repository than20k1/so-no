# Spec Delta

## MODIFIED Requirements

### Requirement: Gợi ý tên không dấu
Khi người dùng gõ tên, hệ thống SHALL gợi ý các người nợ chưa bị xoá có khóa tìm kiếm chứa chuỗi đã gõ sau khi bỏ dấu và chuyển chữ thường. Mỗi gợi ý MUST hiển thị tên, ghi chú phân biệt (nếu có) và số dư hiện tại. Gợi ý MUST xuất hiện ngay khi gõ, không chờ mạng. Người đã bị xoá MUST NOT xuất hiện trong gợi ý.

#### Scenario: Gõ không dấu vẫn ra tên có dấu
- **WHEN** người dùng gõ "lan" và sổ có "Chị Lan", "Cô Lân", "Anh Tú"
- **THEN** danh sách gợi ý có "Chị Lan" và "Cô Lân", không có "Anh Tú"

#### Scenario: Không gợi ý người đã xoá
- **WHEN** người dùng gõ "tu" và "Anh Tú" đang nằm trong thùng rác
- **THEN** "Anh Tú" không có trong gợi ý

### Requirement: Tạo người mới khi ghi nợ
Trong màn Ghi nợ, danh sách gợi ý SHALL luôn có dòng "+ Tạo mới: <tên đã gõ>" ở cuối khi ô tên không trống. Khi người dùng lưu mà không chọn gợi ý: nếu tên đã gõ trùng khớp chính xác khóa tìm kiếm của đúng một người chưa bị xoá thì hệ thống MUST gắn giao dịch vào người đó; nếu không thì hệ thống MUST tạo người nợ mới. Người đã bị xoá MUST NOT được tính khi ghép tên.

#### Scenario: Tên trùng khớp thì gắn vào người cũ
- **WHEN** sổ đã có "Chị Lan" và người dùng gõ "chị lan", nhập 50 rồi lưu mà không chạm gợi ý
- **THEN** giao dịch được gắn vào "Chị Lan" có sẵn, không tạo người mới

#### Scenario: Tên mới thì tạo người mới
- **WHEN** người dùng gõ "Bác Hùng" (chưa có trong sổ), nhập 80 rồi lưu
- **THEN** hệ thống tạo người nợ "Bác Hùng" và ghi nợ 80.000 cho người đó

#### Scenario: Trùng khóa với nhiều người
- **WHEN** sổ có hai người cùng khóa tìm kiếm "chi lan" (khác ghi chú) và người dùng lưu mà không chọn gợi ý
- **THEN** hệ thống không lưu và yêu cầu người dùng chọn một người trong gợi ý hoặc chọn "+ Tạo mới"

#### Scenario: Trùng tên người đã xoá
- **WHEN** "Anh Tú" đang nằm trong thùng rác và người dùng gõ "anh tú", nhập 50 rồi lưu
- **THEN** hệ thống tạo người nợ "Anh Tú" mới, người trong thùng rác giữ nguyên
