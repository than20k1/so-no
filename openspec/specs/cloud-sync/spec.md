# cloud-sync Specification

## Purpose
Giữ sổ nợ của một tài khoản trên server và đồng bộ tự động giữa các máy, trong khi app vẫn ghi/trừ nợ tức thì và dùng được offline; không bao giờ làm mất dòng dữ liệu nào.

## Requirements

### Requirement: Ghi trên máy trước, đồng bộ sau
Mọi thao tác (ghi nợ, trừ nợ, hoàn tác, sửa, xoá, khôi phục, xoá hẳn, nhập sao lưu) SHALL lưu trên máy ngay như khi chưa đăng nhập, không chờ server. Khi đã đăng nhập và có mạng, hệ thống SHALL tự đẩy thay đổi lên server trong vòng vài giây và kéo thay đổi từ server về: khi mở app, sau mỗi thao tác, khi có mạng trở lại, và định kỳ khi app đang mở. Lỗi đồng bộ MUST NOT chặn hay làm chậm thao tác ghi nợ.

#### Scenario: Ghi nợ khi mất mạng rồi có mạng lại
- **WHEN** người dùng đã đăng nhập, ghi nợ 50.000 cho "Chị Lan" lúc offline, sau đó điện thoại có mạng lại
- **THEN** giao dịch được lưu ngay lúc offline và tự lên server khi có mạng, không cần bấm gì

### Requirement: Đồng bộ nhiều máy
Hai máy đăng nhập cùng một tài khoản SHALL thấy cùng một sổ: người nợ, giao dịch (kể cả đã hủy), lịch sử sửa, trạng thái xoá, và số dư giống nhau sau khi cả hai đồng bộ xong.

#### Scenario: Ghi ở máy A, xem ở máy B
- **WHEN** máy A ghi nợ 200.000 cho "Anh Tú" và máy B mở app sau đó
- **THEN** máy B thấy "Anh Tú" nợ 200.000 với cùng dòng lịch sử

### Requirement: Quy tắc gộp không mất dữ liệu
Giao dịch và sự kiện lịch sử sửa SHALL được gộp theo mã định danh: dòng có ở bất kỳ máy nào đều có mặt ở mọi máy sau đồng bộ. Một giao dịch đã hủy ở bất kỳ máy nào MUST ở trạng thái hủy trên mọi máy. Với tên, ghi chú và trạng thái xoá của người nợ, thay đổi tới server sau cùng SHALL thắng, nhưng mọi thay đổi vẫn còn trong lịch sử sửa. Số dư MUST luôn bằng kết quả tính lại từ giao dịch sau khi gộp.

#### Scenario: Hai máy cùng ghi khi offline
- **WHEN** máy A ghi nợ 30.000 và máy B trừ 10.000 cho cùng "Chị Lan" (đang nợ 100.000) khi cả hai offline, rồi cả hai có mạng
- **THEN** cả hai máy đều có đủ hai giao dịch và số dư của "Chị Lan" là 120.000

#### Scenario: Hai máy đổi tên khác nhau
- **WHEN** máy A đổi "Chi Lan" thành "Chị Lan rau" rồi máy B đổi thành "Lan cá", và máy B đồng bộ sau
- **THEN** cả hai máy hiển thị "Lan cá" và lịch sử sửa có cả hai lần đổi tên

### Requirement: Đưa sổ trên máy lên tài khoản
Lần đầu đăng nhập trên một máy, toàn bộ sổ đang có trên máy (kể cả người trong thùng rác và đã xoá hẳn) SHALL được gộp vào sổ của tài khoản. Nếu tài khoản đã có sổ từ máy khác, hai sổ MUST được gộp theo quy tắc gộp, không mất dòng nào; người nợ trùng tên ở hai sổ MUST được giữ là hai người riêng.

#### Scenario: Máy mới có sổ riêng đăng nhập vào tài khoản đã có sổ
- **WHEN** máy B có 3 người nợ (chưa từng đăng nhập) đăng nhập vào tài khoản đã có 5 người nợ từ máy A
- **THEN** sau đồng bộ, cả hai máy có 8 người nợ với đầy đủ giao dịch

### Requirement: Không trộn sổ của hai tài khoản
Nếu máy đang giữ sổ của tài khoản X (đã đăng xuất nhưng giữ sổ) và người dùng đăng nhập tài khoản Y, hệ thống MUST NOT gộp sổ của X vào Y. Hệ thống SHALL yêu cầu chọn xoá sổ trên máy rồi tải sổ của Y về, hoặc huỷ đăng nhập.

#### Scenario: Đăng nhập tài khoản khác trên máy đã có sổ của người khác
- **WHEN** máy giữ sổ của tài khoản số "0912345678" và người dùng đăng nhập số "0987654321"
- **THEN** app hỏi xoá sổ hiện có trên máy để dùng sổ của "0987654321" hay huỷ, và không gửi sổ cũ lên tài khoản mới

### Requirement: Trạng thái đồng bộ
Khi đã đăng nhập, menu SHALL hiển thị số điện thoại của tài khoản, thời điểm đồng bộ thành công gần nhất, trạng thái (đã đồng bộ / đang đồng bộ / có thay đổi chờ gửi / lỗi), và nút "Đồng bộ ngay". Khi phiên đăng nhập hết hạn hoặc bị đăng xuất từ xa, app MUST báo cần đăng nhập lại và giữ nguyên dữ liệu chưa đồng bộ trên máy.

#### Scenario: Có thay đổi chờ gửi
- **WHEN** người dùng đã đăng nhập, đang offline và vừa ghi nợ
- **THEN** menu hiển thị "có thay đổi chờ gửi" cùng thời điểm đồng bộ gần nhất

#### Scenario: Bị đăng xuất vì đổi mật khẩu ở máy khác
- **WHEN** mật khẩu được đặt lại từ máy khác và máy này đồng bộ
- **THEN** app báo cần đăng nhập lại; sổ và thay đổi chưa gửi trên máy vẫn còn và được gửi sau khi đăng nhập lại

### Requirement: Mốc thùng rác theo giờ server
Khi đã đăng nhập, mốc 15 ngày (được xoá hẳn) và 30 ngày (tự xoá hẳn) SHALL tính theo thời điểm server nhận thao tác xoá và giờ server hiện tại, không theo đồng hồ điện thoại. Server MUST từ chối thao tác xoá hẳn gửi lên sớm hơn 15 ngày; khi bị từ chối, máy MUST trả người đó về thùng rác.

#### Scenario: Chỉnh giờ máy để xoá hẳn sớm
- **WHEN** người dùng xoá "Anh Tú" hôm nay, chỉnh đồng hồ điện thoại tới 20 ngày sau rồi bấm "Xoá hẳn"
- **THEN** sau khi đồng bộ, "Anh Tú" vẫn nằm trong thùng rác trên mọi máy

### Requirement: Admin khôi phục người đã xoá hẳn
Người quản trị SHALL khôi phục được người nợ đã xoá hẳn hoặc đang trong thùng rác của một tài khoản (tìm theo số điện thoại tài khoản và tên người nợ) bằng công cụ quản trị chạy riêng, không qua app. Sau khi khôi phục, người đó MUST xuất hiện lại trên mọi máy của tài khoản ở lần đồng bộ kế tiếp, đủ giao dịch, và lịch sử sửa MUST ghi lại việc khôi phục bởi admin.

#### Scenario: Khách gọi nhờ khôi phục
- **WHEN** admin chạy công cụ khôi phục cho "Anh Tú" (đã xoá hẳn) của tài khoản "0912345678"
- **THEN** lần đồng bộ sau, "Anh Tú" trở lại danh sách với số dư và lịch sử như trước khi xoá

### Requirement: Dữ liệu tách biệt giữa tài khoản
Server MUST chỉ trả và chỉ nhận dữ liệu thuộc sổ của tài khoản đang đăng nhập. Yêu cầu không có phiên đăng nhập hợp lệ MUST bị từ chối. Mã sổ do máy gửi lên MUST NOT quyết định dữ liệu được ghi vào sổ nào.

#### Scenario: Gửi dữ liệu kèm mã sổ của người khác
- **WHEN** một yêu cầu đồng bộ gửi lên dòng có mã sổ thuộc tài khoản khác
- **THEN** dữ liệu chỉ được ghi vào sổ của tài khoản đang đăng nhập, sổ kia không bị ảnh hưởng
