# Spec Delta

## Purpose

Mô tả hai luồng thao tác chính là ghi nợ và trừ nợ, được tối ưu để người bán ở chợ hoàn tất trong vài giây: gợi ý tên, tạo người mới, nhập tiền kiểu chợ và lưu tức thì kèm hoàn tác.

## ADDED Requirements

### Requirement: Ô tên tự focus
Khi mở màn Ghi nợ hoặc Trừ nợ, hệ thống SHALL tự đặt con trỏ vào ô nhập tên để người dùng gõ được ngay.

#### Scenario: Mở màn ghi nợ
- **WHEN** người dùng bấm nút "Ghi nợ" ở màn chính
- **THEN** màn Ghi nợ hiện ra với con trỏ đã nằm trong ô tên

### Requirement: Gợi ý tên không dấu
Khi người dùng gõ tên, hệ thống SHALL gợi ý các người nợ có khóa tìm kiếm chứa chuỗi đã gõ sau khi bỏ dấu và chuyển chữ thường. Mỗi gợi ý MUST hiển thị tên, ghi chú phân biệt (nếu có) và số dư hiện tại. Gợi ý MUST xuất hiện ngay khi gõ, không chờ mạng.

#### Scenario: Gõ không dấu vẫn ra tên có dấu
- **WHEN** người dùng gõ "lan" và sổ có "Chị Lan", "Cô Lân", "Anh Tú"
- **THEN** danh sách gợi ý có "Chị Lan" và "Cô Lân", không có "Anh Tú"

### Requirement: Tạo người mới khi ghi nợ
Trong màn Ghi nợ, danh sách gợi ý SHALL luôn có dòng "+ Tạo mới: <tên đã gõ>" ở cuối khi ô tên không trống. Khi người dùng lưu mà không chọn gợi ý: nếu tên đã gõ trùng khớp chính xác khóa tìm kiếm của đúng một người thì hệ thống MUST gắn giao dịch vào người đó; nếu không thì hệ thống MUST tạo người nợ mới.

#### Scenario: Tên trùng khớp thì gắn vào người cũ
- **WHEN** sổ đã có "Chị Lan" và người dùng gõ "chị lan", nhập 50 rồi lưu mà không chạm gợi ý
- **THEN** giao dịch được gắn vào "Chị Lan" có sẵn, không tạo người mới

#### Scenario: Tên mới thì tạo người mới
- **WHEN** người dùng gõ "Bác Hùng" (chưa có trong sổ), nhập 80 rồi lưu
- **THEN** hệ thống tạo người nợ "Bác Hùng" và ghi nợ 80.000 cho người đó

#### Scenario: Trùng khóa với nhiều người
- **WHEN** sổ có hai người cùng khóa tìm kiếm "chi lan" (khác ghi chú) và người dùng lưu mà không chọn gợi ý
- **THEN** hệ thống không lưu và yêu cầu người dùng chọn một người trong gợi ý hoặc chọn "+ Tạo mới"

### Requirement: Trừ nợ chỉ cho người đã có
Màn Trừ nợ SHALL chỉ cho phép chọn người nợ đã có trong sổ và MUST NOT hiển thị dòng "+ Tạo mới". Sau khi chọn người, màn hình MUST hiển thị số đang nợ và nút "Trả hết" điền sẵn số tiền bằng số dư.

#### Scenario: Trả hết
- **WHEN** người dùng chọn "Cô Ba" đang nợ 1.200.000 và bấm "Trả hết" rồi lưu
- **THEN** hệ thống ghi giao dịch trừ nợ 1.200.000 và số dư của "Cô Ba" về 0

#### Scenario: Trừ quá số nợ
- **WHEN** người dùng nhập số tiền trừ lớn hơn số đang nợ
- **THEN** hệ thống hiển thị cảnh báo số tiền vượt quá số nợ nhưng vẫn cho phép lưu nếu người dùng xác nhận bằng một lần bấm

### Requirement: Nhập tiền kiểu chợ
Ô số tiền SHALL dùng bàn phím số và hiểu số người dùng gõ theo đơn vị nghìn đồng: giá trị gõ vào được nhân 1.000. Hệ thống MUST hiển thị trực tiếp số tiền đầy đủ có dấu chấm phân cách hàng nghìn. Hệ thống SHALL có các nút số tiền nhanh 10k, 20k, 50k, 100k, 200k, 500k; bấm nút sẽ cộng thêm giá trị đó vào số tiền hiện tại.

#### Scenario: Gõ 50 thành 50.000
- **WHEN** người dùng gõ "50" vào ô số tiền
- **THEN** màn hình hiển thị "50.000" và giá trị lưu là 50000 đồng

#### Scenario: Cộng dồn nút nhanh
- **WHEN** ô số tiền trống và người dùng bấm "100k" rồi "20k"
- **THEN** số tiền là 120.000

#### Scenario: Số tiền không hợp lệ
- **WHEN** số tiền bằng 0 hoặc để trống
- **THEN** nút Lưu bị vô hiệu hóa

### Requirement: Ghi chú tùy chọn
Màn Ghi nợ và Trừ nợ SHALL có ô ghi chú ngắn không bắt buộc, không chiếm focus mặc định và không cản thao tác lưu.

#### Scenario: Lưu không cần ghi chú
- **WHEN** người dùng có tên và số tiền hợp lệ nhưng để trống ghi chú
- **THEN** người dùng lưu được bình thường

### Requirement: Lưu tức thì kèm hoàn tác
Khi người dùng bấm Lưu với dữ liệu hợp lệ, hệ thống SHALL lưu ngay mà không hỏi xác nhận, quay về màn chính, và hiển thị thông báo "Đã ghi/Đã trừ <số tiền> cho <tên>" kèm nút "Hoàn tác" trong ít nhất 5 giây. Thao tác lưu MUST hoàn tất mà không cần kết nối mạng.

#### Scenario: Lưu khi mất mạng
- **WHEN** thiết bị không có mạng và người dùng lưu một giao dịch ghi nợ
- **THEN** giao dịch được lưu, màn chính hiển thị số dư mới và thông báo có nút "Hoàn tác"

#### Scenario: Bấm hoàn tác
- **WHEN** người dùng bấm "Hoàn tác" trên thông báo vừa hiện
- **THEN** giao dịch vừa lưu bị đánh dấu hủy và số dư trở về như trước khi lưu

#### Scenario: Hoàn tác người vừa tạo mới
- **WHEN** người dùng hoàn tác giao dịch đầu tiên của một người vừa được tạo mới trong cùng thao tác
- **THEN** giao dịch bị đánh dấu hủy và người đó không còn xuất hiện trong danh sách người đang nợ
