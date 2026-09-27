# group-expenses Specification

## Purpose
Cho một nhóm người (đi chơi, ăn chung) ghi lại các khoản chi tiêu: ai trả, chia cho ai, theo bao nhiêu suất. App tự tính mỗi người đã trả, phải góp bao nhiêu, và ai cần chuyển cho ai bao nhiêu để cả nhóm cân bằng.

## Requirements

### Requirement: Chia tiền cần đăng nhập
Chế độ Chia tiền SHALL chỉ dùng được khi đã đăng nhập. Khi chưa đăng nhập, màn Chia tiền MUST hiển thị lời giải thích ngắn và nút mở màn đăng nhập, MUST NOT hiển thị hay tạo nhóm nào. Sau khi đăng nhập xong, người dùng SHALL được đưa trở lại màn Chia tiền.

#### Scenario: Mở Chia tiền khi chưa đăng nhập
- **WHEN** người dùng chưa đăng nhập chuyển sang chế độ Chia tiền
- **THEN** màn hình hiện "Đăng nhập để chia tiền với bạn bè" và nút Đăng nhập, không có nút tạo nhóm

#### Scenario: Đăng nhập xong quay lại Chia tiền
- **WHEN** người dùng bấm Đăng nhập từ màn Chia tiền và đăng nhập thành công
- **THEN** app mở lại màn Chia tiền với danh sách nhóm của tài khoản

### Requirement: Danh sách nhóm
Màn Chia tiền SHALL liệt kê các nhóm chưa bị xoá mà người dùng là thành viên, sắp theo thời điểm có thay đổi gần nhất giảm dần. Mỗi dòng MUST hiển thị tên nhóm, số thành viên, tổng chi của nhóm, và số dư của người dùng trong nhóm (được nhận bao nhiêu hoặc cần trả bao nhiêu). Nhóm mà mọi thành viên có số dư bằng 0 và đã có ít nhất một món MUST hiện "Đã xong". Màn SHALL có nút "Tạo nhóm".

#### Scenario: Nhóm đang còn nợ
- **WHEN** người dùng đang cần trả 216.000 trong nhóm "Đà Lạt" có tổng chi 1.104.000
- **THEN** dòng "Đà Lạt" hiện tổng chi 1.104.000 và "bạn cần trả 216.000"

#### Scenario: Nhóm đã cân bằng
- **WHEN** mọi thành viên trong nhóm "Ăn tối" có số dư bằng 0
- **THEN** dòng "Ăn tối" hiện "Đã xong"

### Requirement: Tạo nhóm
Người dùng SHALL tạo được nhóm mới bằng cách nhập tên nhóm (bắt buộc, tối đa 200 ký tự) và tên của mình trong nhóm (bắt buộc; điền sẵn tên đã dùng lần gần nhất trên máy). Nhóm mới MUST có sẵn người tạo là thành viên đầu tiên, gắn với tài khoản của họ, với 1 suất. Tạo nhóm MUST hoàn tất được khi không có mạng.

#### Scenario: Tạo nhóm khi mất mạng
- **WHEN** người dùng đã đăng nhập, đang offline, tạo nhóm "Đà Lạt"
- **THEN** nhóm "Đà Lạt" xuất hiện ngay trong danh sách với một thành viên là chính người dùng, và lên server khi có mạng

### Requirement: Thành viên và suất
Trong một nhóm, người dùng SHALL thêm được thành viên khách bằng tên, đổi tên và đổi số suất của bất kỳ thành viên nào. Số suất MUST là số nguyên từ 1 đến 20, mặc định 1. Tên thành viên MUST không trống và MUST không trùng tên thành viên khác (còn trong nhóm) sau khi bỏ dấu và chuyển chữ thường. Một nhóm MUST có tối đa 50 thành viên. Mỗi thành viên MUST hiển thị rõ là khách hay đã gắn tài khoản. Đổi số suất MUST NOT làm thay đổi cách chia của các món đã ghi trước đó.

#### Scenario: Thêm một nhà 2 người
- **WHEN** người dùng thêm thành viên "Nhà Hùng" với 2 suất
- **THEN** "Nhà Hùng" xuất hiện trong nhóm với nhãn khách và 2 suất

#### Scenario: Đổi suất không đổi món cũ
- **WHEN** "Nhà T" đang 2 suất, đã có món "Lẩu" chia cho "Nhà T", rồi người dùng đổi "Nhà T" thành 3 suất
- **THEN** món "Lẩu" vẫn tính "Nhà T" 2 suất; các món thêm sau mới mặc định 3 suất

#### Scenario: Trùng tên
- **WHEN** nhóm đã có "Hùng" và người dùng thêm "hung"
- **THEN** hệ thống báo tên đã có trong nhóm và không thêm

### Requirement: Xoá thành viên
Người dùng SHALL xoá được một thành viên khách chưa từng là người trả, người cùng chia, hay một bên của dòng thanh toán nào (kể cả món đã xoá mềm). Thành viên đã dính vào bất kỳ món hay dòng thanh toán nào, hoặc đã gắn tài khoản, MUST NOT xoá được; hệ thống MUST giải thích lý do.

#### Scenario: Xoá khách thêm nhầm
- **WHEN** "Minh" là khách vừa thêm nhầm, chưa dính món nào, và người dùng xoá "Minh"
- **THEN** "Minh" biến khỏi nhóm

#### Scenario: Không xoá được người đã dính món
- **WHEN** "Hùng" là người trả món "Vịt" và người dùng thử xoá "Hùng"
- **THEN** hệ thống báo không xoá được vì "Hùng" đã có trong chi tiêu, và "Hùng" vẫn còn

### Requirement: Ghi món chi tiêu
Người dùng SHALL thêm món chi tiêu gồm: tên món (bắt buộc, tối đa 200 ký tự), số tiền, đúng một người trả, và danh sách người cùng chia (ít nhất một người). Ô số tiền MUST dùng cùng quy tắc nhập tiền kiểu chợ như màn Ghi nợ (gõ 54 thành 54.000) và số tiền MUST là số nguyên từ 1 đến 1.000.000.000 đồng. Người trả mặc định MUST là thành viên gắn với tài khoản đang dùng. Danh sách người cùng chia mặc định MUST là tất cả thành viên với số suất hiện tại của họ; người dùng SHALL bỏ tích hoặc đổi số suất của từng người cho riêng món đó. Người trả MUST NOT bắt buộc có trong danh sách người cùng chia. Lưu món MUST hoàn tất được khi không có mạng.

#### Scenario: Món chia cho cả nhóm
- **WHEN** nhóm có "Nhà T" (2 suất) và "Nhà Hùng" (2 suất), người dùng thêm "Lẩu + nước" gõ 700, người trả "Nhà Hùng", giữ nguyên danh sách chia
- **THEN** món được lưu 700.000, mỗi suất 175.000, "Nhà T" phải góp 350.000 và "Nhà Hùng" phải góp 350.000

#### Scenario: Món trả hộ người khác
- **WHEN** người dùng thêm "Bún đậu" 54.000, người trả "Nhà T", và chỉ tích "Nhà Hùng" trong danh sách chia
- **THEN** "Nhà Hùng" phải góp toàn bộ 54.000 và "Nhà T" không phải góp gì cho món này

#### Scenario: Không chọn ai cùng chia
- **WHEN** người dùng bỏ tích hết mọi người rồi bấm Lưu
- **THEN** hệ thống báo cần chọn ít nhất một người và không lưu

### Requirement: Cách chia và làm tròn
Phần phải góp của mỗi người trong một món SHALL bằng số tiền nhân số suất của người đó chia cho tổng số suất của món, làm tròn xuống đến đồng. Phần dư sau làm tròn MUST được cộng từng đồng một cho những người cùng chia theo thứ tự họ được thêm vào nhóm (sớm trước), để tổng phần góp luôn bằng đúng số tiền của món. Mọi máy MUST tính ra cùng một kết quả cho cùng dữ liệu.

#### Scenario: Chia 100.000 cho 3 người
- **WHEN** món 100.000 chia đều cho An, Bình, Chi (1 suất mỗi người, thêm vào nhóm theo thứ tự đó)
- **THEN** An góp 33.334, Bình góp 33.333, Chi góp 33.333

### Requirement: Số dư và kết quả ai trả ai
Số dư của mỗi thành viên SHALL bằng tổng tiền họ đã trả trong các món, cộng số tiền họ đã chuyển cho người khác, trừ tổng phần họ phải góp, trừ số tiền họ đã nhận từ người khác. Chỉ tính món và dòng thanh toán chưa bị xoá. Phần kết quả MUST liệt kê các lần chuyển tiền "A → B: số tiền" sao cho sau khi thực hiện hết thì mọi người có số dư 0. Số lần chuyển MUST NOT vượt quá số người có số dư khác 0 trừ 1. Kết quả MUST giống nhau trên mọi máy có cùng dữ liệu.

#### Scenario: Chuyến đi trong ghi chú
- **WHEN** nhóm có "Nhà T" và "Nhà Hùng" (mỗi nhà 2 suất) với các món: Bún đậu 54.000, Kem dừa 80.000, Cá 90.000 do "Nhà T" trả và chỉ chia cho "Nhà Hùng"; Lẩu + nước 700.000 và Vịt 180.000 do "Nhà Hùng" trả và chia cho cả hai nhà
- **THEN** kết quả là "Nhà T → Nhà Hùng: 216.000"

#### Scenario: Nhóm ba người
- **WHEN** An trả 300.000 chia đều cho An, Bình, Chi và không có món nào khác
- **THEN** kết quả là "Bình → An: 100.000" và "Chi → An: 100.000"

### Requirement: Đánh dấu đã trả
Mỗi dòng kết quả SHALL có nút "Đánh dấu đã trả". Bấm nút MUST mở ô số tiền điền sẵn đúng số của dòng đó; người dùng SHALL sửa được thành số nhỏ hơn để ghi trả một phần. Lưu MUST tạo một dòng thanh toán "A đã trả B <số tiền>" trong danh sách của nhóm, và kết quả MUST tính lại ngay. Người dùng SHALL cũng ghi được dòng thanh toán bất kỳ giữa hai thành viên mà không cần đi từ kết quả.

#### Scenario: Trả hết
- **WHEN** kết quả là "Nhà T → Nhà Hùng: 216.000" và người dùng bấm "Đánh dấu đã trả" rồi lưu
- **THEN** danh sách có dòng "Nhà T đã trả Nhà Hùng 216.000", kết quả trống và nhóm hiện "Đã xong"

#### Scenario: Trả một phần
- **WHEN** người dùng sửa số tiền thành 100.000 rồi lưu
- **THEN** kết quả còn "Nhà T → Nhà Hùng: 116.000"

### Requirement: Sửa, xoá và khôi phục món
Bất kỳ thành viên có tài khoản nào SHALL sửa được mọi trường của một món hoặc dòng thanh toán, xoá mềm nó, và khôi phục nó. Món đã xoá MUST NOT tính vào số dư và kết quả, nhưng MUST còn xem được trong mục "Đã xoá" của nhóm cùng nút Khôi phục. Sau khi xoá, app MUST hiện thông báo kèm nút "Hoàn tác" trong ít nhất 5 giây.

#### Scenario: Sửa số tiền món
- **WHEN** món "Vịt" 180.000 được sửa thành 200.000
- **THEN** số dư và kết quả tính lại theo 200.000

#### Scenario: Xoá rồi khôi phục
- **WHEN** người dùng xoá món "Cá" rồi mở mục "Đã xoá" và bấm Khôi phục
- **THEN** món "Cá" trở lại danh sách và được tính lại vào kết quả

### Requirement: Lịch sử thay đổi của nhóm
Hệ thống SHALL lưu lịch sử mọi thay đổi trong nhóm: tạo nhóm, đổi tên nhóm, thêm, sửa, xoá thành viên, thêm, sửa, xoá, khôi phục món và dòng thanh toán, vào nhóm, nhận vị trí khách, rời nhóm, xoá và khôi phục nhóm. Mỗi mục MUST ghi ai làm (tên thành viên của tài khoản thực hiện), lúc nào, và giá trị trước và sau với các thay đổi sửa. Lịch sử MUST NOT sửa hay xoá được từ app. Người dùng SHALL xem được lịch sử của cả nhóm và lịch sử riêng của từng món.

#### Scenario: Xem ai sửa số tiền
- **WHEN** Hùng sửa món "Vịt" từ 180.000 thành 200.000
- **THEN** lịch sử món "Vịt" hiện "Hùng sửa số tiền 180.000 → 200.000" kèm thời gian

### Requirement: Xoá nhóm
Chỉ thành viên đã tạo nhóm SHALL xoá được nhóm. Nhóm bị xoá MUST biến khỏi danh sách của mọi thành viên và nằm trong mục "Nhóm đã xoá" của người tạo trong 30 ngày, nơi người tạo SHALL khôi phục được nhóm với đầy đủ dữ liệu cho mọi thành viên. Sau 30 ngày (tính theo giờ server), nhóm MUST NOT hiện ở đâu trong app nữa nhưng dữ liệu MUST vẫn được giữ trên server. Thành viên khác người tạo MUST NOT thấy nút xoá nhóm.

#### Scenario: Người tạo xoá rồi khôi phục
- **WHEN** người tạo xoá nhóm "Đà Lạt", rồi vào "Nhóm đã xoá" bấm Khôi phục trong vòng 30 ngày
- **THEN** nhóm "Đà Lạt" trở lại danh sách của mọi thành viên với đủ món và lịch sử

#### Scenario: Thành viên thường không xoá được nhóm
- **WHEN** Hùng (không phải người tạo) mở nhóm "Đà Lạt"
- **THEN** Hùng không thấy nút xoá nhóm
