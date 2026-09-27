# Spec Delta

## MODIFIED Requirements

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
