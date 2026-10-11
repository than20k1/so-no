## MODIFIED Requirements

### Requirement: Rời nhóm
Thành viên có tài khoản không phải người tạo nhóm SHALL rời được nhóm khi số dư của mình trong nhóm bằng 0. Khi số dư khác 0, app MUST từ chối và hiện số tiền còn lại. Sau khi rời, thành viên đó MUST trở thành khách giữ nguyên tên, số suất và mọi món liên quan, và nhóm MUST biến khỏi máy của người đã rời. Server MUST kiểm tra lại số dư bằng 0 trước khi cho rời.

Người tạo nhóm (trưởng nhóm) MUST NOT thấy nút "Rời nhóm"; muốn thôi dùng nhóm thì xoá nhóm. Server MUST từ chối yêu cầu rời nhóm của người tạo nhóm và nhóm MUST giữ nguyên.

#### Scenario: Rời khi đã hết nợ
- **WHEN** Minh (không phải người tạo) có số dư 0 và bấm "Rời nhóm"
- **THEN** nhóm biến khỏi máy của Minh, còn các thành viên khác vẫn thấy "Minh" là khách

#### Scenario: Chưa trả hết thì không rời được
- **WHEN** Minh còn cần trả 50.000 và bấm "Rời nhóm"
- **THEN** app báo cần trả hết 50.000 trước khi rời và Minh vẫn ở trong nhóm

#### Scenario: Trưởng nhóm không có nút rời
- **WHEN** người tạo nhóm "Đà Lạt" mở phần quản lý nhóm
- **THEN** chỉ thấy "Đổi tên nhóm" và "Xoá nhóm", không có "Rời nhóm"

#### Scenario: Server từ chối trưởng nhóm rời
- **WHEN** một yêu cầu rời nhóm "Đà Lạt" được gửi thẳng tới server bằng tài khoản người tạo nhóm
- **THEN** server từ chối, người tạo vẫn là thành viên gắn tài khoản của nhóm
