# home-screen Specification

## Purpose

Mô tả màn hình chính mở ra đầu tiên: nút menu, hai nút lớn Ghi nợ / Trừ nợ nằm trong tầm ngón cái, và danh sách người đang nợ có ô tìm kiếm để trả lời nhanh câu hỏi "tôi nợ bao nhiêu rồi?".

## Requirements

### Requirement: Bố cục màn chính
Màn chính SHALL gồm theo thứ tự từ trên xuống: hàng header có nút menu `[=]` ở góc trên, công tắc chế độ `Ghi nợ | Chia tiền`, và tổng số tiền đang được nợ; tiếp theo là hai nút lớn "Ghi nợ" và "Trừ nợ", ô tìm kiếm, và danh sách người đang nợ. Hai nút lớn MUST có vùng chạm cao tối thiểu 72px và MUST nằm trong màn hình đầu tiên, không cần cuộn, trên màn hình điện thoại rộng 360px cao 640px. Công tắc chế độ MUST có vùng chạm cao tối thiểu 44px và MUST hiện rõ chế độ đang chọn.

#### Scenario: Mở app trên điện thoại nhỏ
- **WHEN** người dùng mở app trên màn hình 360x640
- **THEN** thấy ngay nút menu, công tắc chế độ và cả hai nút "Ghi nợ", "Trừ nợ" mà không phải cuộn

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

### Requirement: Trạng thái trống
Khi sổ chưa có người nợ nào, màn chính SHALL hiển thị lời hướng dẫn ngắn thay cho danh sách và vẫn hiển thị đầy đủ hai nút lớn.

#### Scenario: Lần đầu dùng
- **WHEN** người dùng mở app lần đầu, sổ trống
- **THEN** màn chính hiển thị hai nút lớn và dòng hướng dẫn bấm "Ghi nợ" để bắt đầu

### Requirement: Chuyển chế độ Ghi nợ / Chia tiền
Chạm "Chia tiền" trên công tắc SHALL mở màn Chia tiền, có cùng nút menu `[=]` và cùng công tắc ở header; chạm "Ghi nợ" SHALL trở về màn Ghi nợ. App MUST nhớ chế độ dùng lần cuối trên máy và mở lại đúng chế độ đó ở lần mở sau. Chế độ mặc định ở lần mở đầu tiên MUST là Ghi nợ. Việc chuyển chế độ MUST NOT làm mất dữ liệu đang có của chế độ kia.

#### Scenario: Chuyển sang Chia tiền rồi mở lại app
- **WHEN** người dùng chuyển sang "Chia tiền", đóng app rồi mở lại
- **THEN** app mở ở màn Chia tiền với công tắc đang chọn "Chia tiền"

#### Scenario: Lần đầu mở app
- **WHEN** người dùng mở app lần đầu tiên
- **THEN** app mở ở màn Ghi nợ
