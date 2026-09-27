# Spec Delta

## Purpose

Cho nhiều tài khoản cùng xem và ghi vào một nhóm Chia tiền trên máy của mình. Mọi người vào nhóm bằng link mời, nhận lại vị trí khách đã được ghi sẵn, và thấy cùng một số liệu sau khi đồng bộ.

## ADDED Requirements

### Requirement: Link mời
Mọi thành viên có tài khoản SHALL lấy được link mời của nhóm và gửi nó qua bảng chia sẻ của điện thoại (ví dụ Zalo) hoặc hiện dưới dạng mã QR. Lấy link MUST cần mạng; khi offline app MUST báo cần kết nối. Nhóm vừa tạo lúc offline MUST được đồng bộ lên server trước khi có link. Người tạo nhóm SHALL đổi được link; sau khi đổi, link cũ MUST không còn dùng được để vào nhóm, còn thành viên đã vào thì không bị ảnh hưởng.

#### Scenario: Gửi link qua Zalo
- **WHEN** thành viên bấm "Mời bạn" trong nhóm "Đà Lạt" khi có mạng
- **THEN** app mở bảng chia sẻ với link vào nhóm "Đà Lạt"

#### Scenario: Đổi link sau khi lỡ gửi nhầm
- **WHEN** người tạo đổi link, rồi một người khác mở link cũ
- **THEN** người đó thấy báo link không còn hiệu lực và không vào được nhóm

### Requirement: Vào nhóm bằng link
Mở link mời SHALL mở app tại màn vào nhóm. Nếu chưa đăng nhập, app MUST yêu cầu đăng nhập hoặc đăng ký rồi quay lại màn vào nhóm. Màn vào nhóm MUST hiện tên nhóm, danh sách thành viên, và cho chọn một trong hai: "Tôi là <tên>" với một thành viên khách chưa có ai nhận, hoặc "Tôi là người mới" kèm ô nhập tên. Người đã là thành viên mở link MUST được đưa thẳng vào nhóm. Một tài khoản MUST chỉ gắn với tối đa một thành viên trong mỗi nhóm.

#### Scenario: Nhận vị trí khách
- **WHEN** nhóm có khách "Hùng" đã là người trả món "Vịt", và Hùng mở link, đăng nhập, chọn "Tôi là Hùng"
- **THEN** thành viên "Hùng" gắn với tài khoản của Hùng, máy Hùng tải về đầy đủ nhóm, và món "Vịt" vẫn do "Hùng" trả

#### Scenario: Vào như người mới
- **WHEN** Minh mở link và chọn "Tôi là người mới" với tên "Minh"
- **THEN** nhóm có thêm thành viên "Minh" (1 suất) gắn với tài khoản của Minh

#### Scenario: Hai người cùng nhận một vị trí
- **WHEN** hai tài khoản gần như cùng lúc chọn "Tôi là Hùng"
- **THEN** chỉ tài khoản gửi tới server trước nhận được; tài khoản kia được báo vị trí đã có người nhận và được chọn lại

### Requirement: Rời nhóm
Thành viên có tài khoản SHALL rời được nhóm khi số dư của mình trong nhóm bằng 0. Khi số dư khác 0, app MUST từ chối và hiện số tiền còn lại. Sau khi rời, thành viên đó MUST trở thành khách giữ nguyên tên, số suất và mọi món liên quan, và nhóm MUST biến khỏi máy của người đã rời. Server MUST kiểm tra lại số dư bằng 0 trước khi cho rời.

#### Scenario: Rời khi đã hết nợ
- **WHEN** Minh có số dư 0 và bấm "Rời nhóm"
- **THEN** nhóm biến khỏi máy của Minh, còn các thành viên khác vẫn thấy "Minh" là khách

#### Scenario: Chưa trả hết thì không rời được
- **WHEN** Minh còn cần trả 50.000 và bấm "Rời nhóm"
- **THEN** app báo cần trả hết 50.000 trước khi rời và Minh vẫn ở trong nhóm

### Requirement: Đồng bộ nhóm giữa các thành viên
Mọi thay đổi trong nhóm SHALL lưu trên máy ngay rồi tự đồng bộ: khi mở app, vài giây sau mỗi thao tác, khi có mạng trở lại, và mỗi 60 giây khi app đang mở. Sau khi các máy đồng bộ xong, mọi thành viên MUST thấy cùng thành viên, món, dòng thanh toán, trạng thái xoá, lịch sử và kết quả. Món và dòng thanh toán tạo trên các máy khác nhau MUST đều có mặt, không mất dòng nào. Lỗi đồng bộ nhóm MUST NOT chặn thao tác ghi trên máy, và MUST NOT ảnh hưởng tới đồng bộ sổ nợ.

#### Scenario: Hai người cùng ghi khi offline
- **WHEN** An và Hùng mỗi người ghi một món vào nhóm "Đà Lạt" lúc offline rồi cả hai có mạng
- **THEN** sau đồng bộ cả hai máy có đủ hai món và cùng một kết quả

#### Scenario: Thấy món người khác vừa thêm
- **WHEN** Hùng thêm món "Cà phê" trong lúc An đang mở nhóm "Đà Lạt" có mạng
- **THEN** món "Cà phê" hiện trên máy An trong vòng khoảng một phút mà An không phải làm gì

### Requirement: Hai người sửa cùng một món
Khi hai thành viên sửa hoặc xoá cùng một món (hoặc cùng một thành viên, hoặc tên nhóm), bản sửa tới server sau cùng SHALL là giá trị cuối cùng trên mọi máy. Mọi bản sửa MUST vẫn còn trong lịch sử.

#### Scenario: Sửa chồng nhau
- **WHEN** An sửa "Vịt" thành 200.000 rồi Hùng sửa "Vịt" thành 190.000, và bản của Hùng tới server sau
- **THEN** mọi máy hiện "Vịt" 190.000 và lịch sử có cả hai lần sửa

### Requirement: Quyền truy cập nhóm
Server MUST chỉ trả dữ liệu của những nhóm mà tài khoản đang đăng nhập là thành viên, và MUST chỉ nhận thay đổi vào những nhóm đó. Thay đổi gửi vào nhóm mà tài khoản không phải thành viên MUST bị từ chối và không ảnh hưởng tới nhóm đó. Tài khoản đã rời nhóm MUST NOT nhận thêm dữ liệu mới của nhóm. Chỉ người tạo nhóm MUST được xoá, khôi phục nhóm và đổi link mời, và server MUST kiểm tra quyền này. Link mời MUST đủ dài và ngẫu nhiên để không đoán được.

#### Scenario: Gửi món vào nhóm của người khác
- **WHEN** một yêu cầu đồng bộ gửi món vào nhóm mà tài khoản không phải thành viên
- **THEN** server từ chối món đó và nhóm kia không thay đổi

#### Scenario: Người đã rời không thấy món mới
- **WHEN** Minh đã rời nhóm và sau đó An thêm món mới
- **THEN** máy Minh không nhận được món mới đó
