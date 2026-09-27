# user-account Specification

## Purpose
Cho người bán tạo tài khoản bằng số điện thoại để giữ sổ nợ trên server: đăng ký có xác nhận email bằng mã OTP, đăng nhập bằng số điện thoại và mật khẩu, lấy lại mật khẩu qua email, và đăng xuất an toàn.

## Requirements

### Requirement: Đăng ký tài khoản
Màn đăng ký SHALL gồm số điện thoại, email, mật khẩu và nhập lại mật khẩu. Hệ thống MUST kiểm tra: số điện thoại Việt Nam hợp lệ, email hợp lệ, mật khẩu ít nhất 6 ký tự, hai lần nhập mật khẩu trùng nhau, số điện thoại và email chưa được dùng bởi tài khoản khác. Số điện thoại MUST được chuẩn hoá để "0912 345 678", "0912345678" và "+84912345678" là cùng một số. Khi thông tin hợp lệ, hệ thống SHALL gửi mã OTP 6 chữ số tới email và chuyển sang bước nhập mã. Tài khoản MUST chưa đăng nhập được cho tới khi nhập đúng mã.

#### Scenario: Đăng ký thành công
- **WHEN** người dùng nhập số "0912 345 678", email hợp lệ, mật khẩu "123456" hai lần giống nhau, rồi nhập đúng mã OTP nhận qua email
- **THEN** tài khoản được kích hoạt, người dùng được đăng nhập và sổ trên máy bắt đầu đồng bộ

#### Scenario: Mật khẩu nhập lại không khớp
- **WHEN** mật khẩu và nhập lại mật khẩu khác nhau
- **THEN** hệ thống báo hai mật khẩu không khớp và không gửi mã

#### Scenario: Số điện thoại đã có tài khoản
- **WHEN** người dùng đăng ký bằng "+84912345678" trong khi đã có tài khoản số "0912345678"
- **THEN** hệ thống báo số điện thoại đã được đăng ký và gợi ý đăng nhập hoặc quên mật khẩu

#### Scenario: Chưa nhập mã thì chưa đăng nhập được
- **WHEN** người dùng đã điền đăng ký nhưng chưa nhập mã OTP, rồi thử đăng nhập bằng số điện thoại và mật khẩu đó
- **THEN** hệ thống không cho đăng nhập và đề nghị gửi lại mã xác nhận tới email

### Requirement: Mã OTP qua email
Mã OTP SHALL gồm 6 chữ số, hết hạn sau 10 phút và MUST bị vô hiệu sau 5 lần nhập sai. Người dùng SHALL gửi lại được mã mới, nhưng không quá một lần mỗi 60 giây. Email chứa mã MUST ghi rõ tên app và mục đích (kích hoạt tài khoản hoặc đặt lại mật khẩu).

#### Scenario: Mã hết hạn
- **WHEN** người dùng nhập mã nhận được từ 11 phút trước
- **THEN** hệ thống báo mã đã hết hạn và cho gửi mã mới

#### Scenario: Nhập sai quá 5 lần
- **WHEN** người dùng nhập sai mã 5 lần
- **THEN** mã đó không dùng được nữa kể cả nhập đúng, và người dùng phải gửi mã mới

### Requirement: Đăng nhập bằng số điện thoại
Màn đăng nhập SHALL gồm số điện thoại và mật khẩu. Khi sai, hệ thống MUST chỉ báo chung "số điện thoại hoặc mật khẩu không đúng", không tiết lộ số điện thoại có tài khoản hay không. Sau 5 lần sai liên tiếp với cùng một số điện thoại, hệ thống MUST từ chối mọi lần đăng nhập số đó trong 15 phút, kể cả khi nhập đúng mật khẩu, và báo thời gian chờ. Đăng nhập đúng MUST đặt lại bộ đếm lần sai.

#### Scenario: Đăng nhập thành công
- **WHEN** người dùng nhập đúng số điện thoại (bất kỳ cách viết nào) và mật khẩu
- **THEN** người dùng được đăng nhập, quay về màn chính và đồng bộ bắt đầu

#### Scenario: Khoá sau 5 lần sai
- **WHEN** người dùng nhập sai mật khẩu 5 lần liên tiếp rồi nhập đúng ngay sau đó
- **THEN** hệ thống vẫn từ chối và báo phải chờ 15 phút

### Requirement: Phiên đăng nhập
Sau khi đăng nhập, người dùng SHALL giữ trạng thái đăng nhập trên máy đó ít nhất 1 năm nếu vẫn mở app định kỳ, không phải đăng nhập lại mỗi ngày. Thông tin phiên MUST được lưu sao cho mã JavaScript của trang không đọc được.

#### Scenario: Mở lại app sau một tuần
- **WHEN** người dùng đã đăng nhập, đóng app một tuần rồi mở lại
- **THEN** người dùng vẫn đang đăng nhập và đồng bộ tiếp tục

### Requirement: Quên mật khẩu
Màn quên mật khẩu SHALL cho người dùng nhập số điện thoại; hệ thống gửi mã OTP tới email đã đăng ký của số đó và hiển thị email đã che bớt (ví dụ "th***@gmail.com"). Người dùng nhập mã cùng mật khẩu mới (kèm nhập lại) để đặt lại mật khẩu. Đặt lại thành công MUST đăng xuất mọi phiên khác của tài khoản và gỡ khoá đăng nhập. Nếu số điện thoại không có tài khoản, hệ thống MUST phản hồi giống như khi có (không tiết lộ).

#### Scenario: Đặt lại mật khẩu
- **WHEN** người dùng nhập số điện thoại, nhận mã qua email, nhập mã và mật khẩu mới hợp lệ
- **THEN** mật khẩu mới dùng được ngay, mật khẩu cũ không còn đăng nhập được, và máy khác đang đăng nhập bị đăng xuất

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

### Requirement: Màn tài khoản cần mạng
Đăng ký, đăng nhập và quên mật khẩu SHALL cần kết nối mạng. Khi không có mạng, các màn này MUST báo rõ cần kết nối và MUST NOT làm ảnh hưởng tới việc ghi/trừ nợ trên máy.

#### Scenario: Mở màn đăng nhập khi mất mạng
- **WHEN** thiết bị ở chế độ máy bay và người dùng mở màn đăng nhập
- **THEN** màn hình báo cần có mạng để đăng nhập, và quay về màn chính vẫn ghi nợ được
