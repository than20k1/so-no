# Spec Delta

## MODIFIED Requirements

### Requirement: Đăng xuất
Người dùng SHALL đăng xuất được từ menu. Trước khi đăng xuất, hệ thống MUST hỏi giữ hay xoá sổ trên máy này, mặc định là giữ. Dữ liệu Chia tiền (các nhóm) trên máy MUST luôn bị xoá khi đăng xuất, bất kể chọn giữ hay xoá sổ, và hệ thống MUST nói rõ điều này trong hộp hỏi. Nếu còn thay đổi chưa đồng bộ (của sổ hoặc của nhóm) mà sẽ bị xoá, hệ thống MUST cảnh báo trước khi cho đăng xuất.

#### Scenario: Đăng xuất giữ sổ
- **WHEN** người dùng đăng xuất và chọn giữ sổ
- **THEN** app vẫn hiển thị sổ trên máy, dùng được offline, và không còn đồng bộ

#### Scenario: Đăng xuất xoá sổ khi còn thay đổi chưa đồng bộ
- **WHEN** máy đang offline, có giao dịch chưa đồng bộ, và người dùng chọn xoá sổ khi đăng xuất
- **THEN** hệ thống cảnh báo sẽ mất các thay đổi chưa đồng bộ và chỉ xoá khi người dùng xác nhận lần nữa

#### Scenario: Đăng xuất khi còn món chưa gửi
- **WHEN** máy đang offline, vừa thêm món vào nhóm "Đà Lạt", và người dùng đăng xuất chọn giữ sổ
- **THEN** hệ thống cảnh báo món chưa gửi sẽ mất và chỉ đăng xuất khi người dùng xác nhận lần nữa; sau khi đăng xuất, màn Chia tiền không còn nhóm nào

#### Scenario: Đăng nhập lại thấy lại nhóm
- **WHEN** người dùng đã đăng xuất (nhóm đã đồng bộ hết) rồi đăng nhập lại cùng tài khoản
- **THEN** các nhóm được tải về lại đầy đủ
