# debtor-history Specification

## Purpose

Mô tả màn chi tiết một người nợ: số dư hiện tại và toàn bộ lịch sử ghi/trừ nợ theo từng dòng, kể cả dòng đã hủy, để làm chứng cứ minh bạch khi có tranh cãi.

## Requirements

### Requirement: Thông tin người nợ
Màn chi tiết SHALL hiển thị tên, ghi chú phân biệt (nếu có), số dư hiện tại, hai nút "Ghi thêm" và "Trừ nợ", và một nút "Sửa" mở bảng sửa tên, ghi chú và xoá người nợ. Bấm "Ghi thêm" hoặc "Trừ nợ" MUST mở màn tương ứng với người này đã được chọn sẵn. Khi người nợ đang trong thùng rác, màn chi tiết MUST hiển thị trạng thái đã xoá kèm nút "Khôi phục" thay cho các nút "Ghi thêm", "Trừ nợ" và "Sửa", và vẫn hiển thị đầy đủ lịch sử.

#### Scenario: Trừ nợ từ màn chi tiết
- **WHEN** người dùng đang xem "Chị Lan" và bấm "Trừ nợ"
- **THEN** màn Trừ nợ mở ra với "Chị Lan" đã được chọn và hiển thị số đang nợ

#### Scenario: Mở bảng sửa
- **WHEN** người dùng đang xem "Chị Lan" và bấm "Sửa"
- **THEN** bảng sửa hiện ra với tên và ghi chú hiện tại, có nút lưu và nút xoá người này

#### Scenario: Xem người trong thùng rác
- **WHEN** người dùng mở chi tiết "Anh Tú" từ Thùng rác
- **THEN** màn hình cho biết "Anh Tú" đã bị xoá, có nút "Khôi phục", không có nút ghi, trừ nợ hay sửa

### Requirement: Lịch sử giao dịch
Màn chi tiết SHALL liệt kê mọi giao dịch của người đó, mới nhất ở trên, mỗi dòng gồm ngày giờ, dấu cộng cho ghi nợ hoặc dấu trừ cho trừ nợ, số tiền và ghi chú (nếu có).

#### Scenario: Xem lịch sử
- **WHEN** "Chị Lan" có ghi nợ 200.000 ngày 12/09 và trừ nợ 100.000 ngày 25/09
- **THEN** lịch sử hiển thị dòng "25/09 − 100.000" phía trên dòng "12/09 + 200.000"

### Requirement: Hiển thị dòng đã hủy
Giao dịch đã hủy SHALL vẫn xuất hiện trong lịch sử, được hiển thị gạch ngang và kèm thời điểm hủy, và MUST NOT được tính vào số dư.

#### Scenario: Dòng hủy vẫn hiện
- **WHEN** người dùng đã hoàn tác một giao dịch ghi nợ 30.000 của "Chị Lan"
- **THEN** lịch sử vẫn có dòng 30.000 bị gạch ngang kèm giờ hủy

### Requirement: Hiển thị ngày xảy ra khác ngày ghi
Khi ngày xảy ra của giao dịch khác ngày tạo, dòng lịch sử SHALL hiển thị ngày xảy ra làm ngày chính và ghi chú phụ nguồn cùng ngày nhập vào app. Khi ngày xảy ra để trống, dòng MUST hiển thị ngày tạo kèm nhãn nguồn.

#### Scenario: Giao dịch nhập từ file sao lưu
- **WHEN** một giao dịch có ngày xảy ra 12/05, nguồn "sao lưu" và ngày tạo 26/09
- **THEN** dòng lịch sử hiển thị "12/05" kèm dòng phụ cho biết được nhập từ sao lưu ngày 26/09
