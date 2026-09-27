# Spec Delta

## MODIFIED Requirements

### Requirement: Danh sách người đang nợ
Danh sách SHALL hiển thị những người chưa bị xoá có số dư lớn hơn 0, mỗi dòng gồm tên, ghi chú phân biệt (nếu có) và số dư, sắp xếp theo thời điểm giao dịch gần nhất giảm dần. Chạm vào một dòng MUST mở màn chi tiết của người đó. Tổng số tiền đang được nợ MUST chỉ tính người chưa bị xoá.

#### Scenario: Người đã trả hết không hiện
- **WHEN** "Cô Ba" có số dư bằng 0
- **THEN** "Cô Ba" không xuất hiện trong danh sách người đang nợ

#### Scenario: Người vừa giao dịch lên đầu
- **WHEN** người dùng vừa ghi nợ cho "Anh Tú"
- **THEN** "Anh Tú" nằm ở đầu danh sách

#### Scenario: Người đã xoá không hiện và không tính tiền
- **WHEN** "Anh Tú" đang nợ 150.000 bị xoá vào thùng rác
- **THEN** "Anh Tú" không xuất hiện trong danh sách và tổng tiền không tính 150.000 đó

### Requirement: Tìm kiếm trong danh sách
Ô tìm kiếm SHALL lọc danh sách theo cùng quy tắc bỏ dấu, không phân biệt hoa thường như gợi ý tên, và khi đang tìm MUST hiển thị cả người có số dư bằng 0. Kết quả tìm MUST NOT có người đã bị xoá.

#### Scenario: Tìm người đã trả hết
- **WHEN** người dùng gõ "ba" vào ô tìm và "Cô Ba" có số dư 0
- **THEN** "Cô Ba" xuất hiện trong kết quả với số dư 0

#### Scenario: Tìm không ra người đã xoá
- **WHEN** người dùng gõ "tu" và "Anh Tú" đang nằm trong thùng rác
- **THEN** "Anh Tú" không có trong kết quả
