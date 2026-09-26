# Spec Delta

## Purpose

Định nghĩa sổ nợ dạng ghi thêm, không tẩy xóa: người nợ, giao dịch, cách tính số dư, hoàn tác bằng đánh dấu hủy, và các trường chuẩn bị cho đồng bộ, nhiều người dùng, nợ hai chiều và quét sổ giấy ở các bản sau.

## ADDED Requirements

### Requirement: Sổ nợ chỉ ghi thêm
Hệ thống SHALL lưu mỗi lần ghi nợ hoặc trừ nợ thành một giao dịch mới. Hệ thống MUST NOT sửa số tiền, người nợ hay thời gian của một giao dịch đã lưu, và MUST NOT xóa vĩnh viễn giao dịch trong luồng sử dụng thông thường.

#### Scenario: Trừ nợ tạo dòng mới
- **WHEN** người dùng trừ 100.000 cho "Chị Lan" đang nợ 250.000
- **THEN** hệ thống thêm một giao dịch trừ 100.000 và các giao dịch cũ của "Chị Lan" giữ nguyên

### Requirement: Dữ liệu người nợ
Mỗi người nợ SHALL có mã định danh duy nhất toàn cục, thuộc về một sổ, có tên hiển thị, ghi chú phân biệt tùy chọn, và một khóa tìm kiếm là tên đã bỏ dấu tiếng Việt và chuyển về chữ thường.

#### Scenario: Khóa tìm kiếm bỏ dấu
- **WHEN** tạo người nợ tên "Chị Lân"
- **THEN** khóa tìm kiếm của người đó là "chi lan"

### Requirement: Dữ liệu giao dịch
Mỗi giao dịch SHALL gồm: mã định danh duy nhất toàn cục tạo được khi offline, mã sổ, mã người nợ, số tiền là số nguyên dương tính bằng đồng, loại (ghi nợ hoặc trừ nợ), chiều nợ, ngày xảy ra (có thể để trống), thời điểm tạo, thời điểm cập nhật, trạng thái đã hủy kèm thời điểm hủy, nguồn (nhập tay, sao lưu, quét sổ), ghi chú tùy chọn, và mã thiết bị. Ở bản này chiều nợ MUST luôn là "khách nợ mình" và nguồn của giao dịch nhập tay MUST là "nhập tay".

#### Scenario: Giao dịch nhập tay
- **WHEN** người dùng ghi nợ 50.000 cho "Anh Tú"
- **THEN** giao dịch có chiều "khách nợ mình", nguồn "nhập tay", ngày xảy ra bằng ngày tạo và mã định danh không trùng với bất kỳ giao dịch nào khác

### Requirement: Thời điểm tạo không sửa được
Thời điểm tạo của giao dịch SHALL do hệ thống tự ghi lúc lưu. Giao diện MUST NOT cho phép người dùng sửa thời điểm tạo.

#### Scenario: Không có chỗ sửa thời gian
- **WHEN** người dùng xem một giao dịch đã lưu
- **THEN** giao diện không có thao tác nào để đổi thời điểm tạo của giao dịch đó

### Requirement: Tính số dư
Số dư của một người nợ SHALL bằng tổng các giao dịch ghi nợ trừ đi tổng các giao dịch trừ nợ, chỉ tính các giao dịch chưa bị hủy. Số dư MUST được cập nhật ngay trong cùng thao tác lưu hoặc hủy giao dịch.

#### Scenario: Bỏ qua giao dịch đã hủy
- **WHEN** "Chị Lan" có ghi nợ 200.000, ghi nợ 30.000 (đã hủy) và trừ nợ 100.000
- **THEN** số dư của "Chị Lan" là 100.000

### Requirement: Hoàn tác bằng đánh dấu hủy
Hoàn tác một giao dịch SHALL đánh dấu giao dịch đó là đã hủy và ghi lại thời điểm hủy, thay vì xóa giao dịch.

#### Scenario: Hoàn tác giữ lại dấu vết
- **WHEN** người dùng hoàn tác giao dịch ghi nợ 30.000 vừa tạo
- **THEN** giao dịch vẫn tồn tại với trạng thái đã hủy và thời điểm hủy, và số dư không còn tính 30.000 đó

### Requirement: Đường nhập hàng loạt dùng chung
Hệ thống SHALL có một đường nhập hàng loạt nhận danh sách dòng (tên, số tiền, loại, ngày xảy ra tùy chọn, ghi chú tùy chọn, nguồn), ghép tên theo cùng quy tắc với luồng ghi nợ, và ghi tất cả các dòng trong một thao tác nguyên tử. Nếu một dòng không hợp lệ thì MUST NOT ghi dòng nào.

#### Scenario: Một dòng lỗi thì không ghi gì
- **WHEN** nhập 3 dòng trong đó một dòng có số tiền âm
- **THEN** hệ thống từ chối cả lô, báo dòng bị lỗi và không thay đổi dữ liệu

#### Scenario: Ghép tên khi nhập hàng loạt
- **WHEN** nhập một dòng tên "chi lan" trong khi đã có đúng một người có khóa tìm kiếm "chi lan"
- **THEN** giao dịch được gắn vào người đã có thay vì tạo người mới
