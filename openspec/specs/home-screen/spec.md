# home-screen Specification

## Purpose

Mô tả màn hình chính mở ra đầu tiên: nút menu, hai nút lớn Ghi nợ / Trừ nợ nằm trong tầm ngón cái, và danh sách người đang nợ có ô tìm kiếm để trả lời nhanh câu hỏi "tôi nợ bao nhiêu rồi?".

## Requirements

### Requirement: Bố cục màn chính
Màn chính SHALL gồm theo thứ tự từ trên xuống: nút menu `[=]` ở góc trên, tổng số tiền đang được nợ, hai nút lớn "Ghi nợ" và "Trừ nợ", ô tìm kiếm, và danh sách người đang nợ. Hai nút lớn MUST có vùng chạm cao tối thiểu 72px và MUST nằm trong màn hình đầu tiên, không cần cuộn, trên màn hình điện thoại rộng 360px cao 640px.

#### Scenario: Mở app trên điện thoại nhỏ
- **WHEN** người dùng mở app trên màn hình 360x640
- **THEN** thấy ngay nút menu và cả hai nút "Ghi nợ", "Trừ nợ" mà không phải cuộn

### Requirement: Danh sách người đang nợ
Danh sách SHALL hiển thị những người có số dư lớn hơn 0, mỗi dòng gồm tên, ghi chú phân biệt (nếu có) và số dư, sắp xếp theo thời điểm giao dịch gần nhất giảm dần. Chạm vào một dòng MUST mở màn chi tiết của người đó.

#### Scenario: Người đã trả hết không hiện
- **WHEN** "Cô Ba" có số dư bằng 0
- **THEN** "Cô Ba" không xuất hiện trong danh sách người đang nợ

#### Scenario: Người vừa giao dịch lên đầu
- **WHEN** người dùng vừa ghi nợ cho "Anh Tú"
- **THEN** "Anh Tú" nằm ở đầu danh sách

### Requirement: Tìm kiếm trong danh sách
Ô tìm kiếm SHALL lọc danh sách theo cùng quy tắc bỏ dấu, không phân biệt hoa thường như gợi ý tên, và khi đang tìm MUST hiển thị cả người có số dư bằng 0.

#### Scenario: Tìm người đã trả hết
- **WHEN** người dùng gõ "ba" vào ô tìm và "Cô Ba" có số dư 0
- **THEN** "Cô Ba" xuất hiện trong kết quả với số dư 0

### Requirement: Trạng thái trống
Khi sổ chưa có người nợ nào, màn chính SHALL hiển thị lời hướng dẫn ngắn thay cho danh sách và vẫn hiển thị đầy đủ hai nút lớn.

#### Scenario: Lần đầu dùng
- **WHEN** người dùng mở app lần đầu, sổ trống
- **THEN** màn chính hiển thị hai nút lớn và dòng hướng dẫn bấm "Ghi nợ" để bắt đầu
