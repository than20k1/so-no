# Spec Delta

## MODIFIED Requirements

### Requirement: Bố cục màn chính
Màn chính SHALL gồm theo thứ tự từ trên xuống: hàng header có nút menu `[=]` ở góc trên, công tắc chế độ `Ghi nợ | Chia tiền`, và tổng số tiền đang được nợ; tiếp theo là hai nút lớn "Ghi nợ" và "Trừ nợ", ô tìm kiếm, và danh sách người đang nợ. Hai nút lớn MUST có vùng chạm cao tối thiểu 72px và MUST nằm trong màn hình đầu tiên, không cần cuộn, trên màn hình điện thoại rộng 360px cao 640px. Công tắc chế độ MUST có vùng chạm cao tối thiểu 44px và MUST hiện rõ chế độ đang chọn.

#### Scenario: Mở app trên điện thoại nhỏ
- **WHEN** người dùng mở app trên màn hình 360x640
- **THEN** thấy ngay nút menu, công tắc chế độ và cả hai nút "Ghi nợ", "Trừ nợ" mà không phải cuộn

## ADDED Requirements

### Requirement: Chuyển chế độ Ghi nợ / Chia tiền
Chạm "Chia tiền" trên công tắc SHALL mở màn Chia tiền, có cùng nút menu `[=]` và cùng công tắc ở header; chạm "Ghi nợ" SHALL trở về màn Ghi nợ. App MUST nhớ chế độ dùng lần cuối trên máy và mở lại đúng chế độ đó ở lần mở sau. Chế độ mặc định ở lần mở đầu tiên MUST là Ghi nợ. Việc chuyển chế độ MUST NOT làm mất dữ liệu đang có của chế độ kia.

#### Scenario: Chuyển sang Chia tiền rồi mở lại app
- **WHEN** người dùng chuyển sang "Chia tiền", đóng app rồi mở lại
- **THEN** app mở ở màn Chia tiền với công tắc đang chọn "Chia tiền"

#### Scenario: Lần đầu mở app
- **WHEN** người dùng mở app lần đầu tiên
- **THEN** app mở ở màn Ghi nợ
