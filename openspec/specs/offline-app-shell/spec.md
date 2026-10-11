# offline-app-shell Specification

## Purpose

Bảo đảm app mở cực nhanh và dùng được khi không có mạng ở chợ: cài được ra màn hình chính, chạy hoàn toàn offline sau lần mở đầu, và giảm rủi ro trình duyệt tự xóa dữ liệu sổ nợ.

## Requirements

### Requirement: Tải nhanh
Màn chính SHALL hiển thị hai nút "Ghi nợ" và "Trừ nợ" có thể bấm được trong vòng 2 giây ở lần mở đầu tiên trên mạng 4G chậm (theo cấu hình giả lập "Slow 4G" và CPU chậm 4 lần), và trong vòng 1 giây ở các lần mở sau. Tổng dung lượng JavaScript tải cho màn chính (đã nén) MUST NOT vượt quá 180KB. Script chỉ dành cho trình duyệt cũ (`nomodule`) không tính vào ngân sách.

#### Scenario: Mở lần sau
- **WHEN** người dùng mở lại app đã từng mở trước đó
- **THEN** hai nút lớn bấm được trong vòng 1 giây

### Requirement: Hoạt động offline
Sau lần mở đầu tiên thành công, toàn bộ chức năng làm việc với sổ (ghi nợ, trừ nợ, xem danh sách, xem chi tiết, hoàn tác, sửa và xoá người nợ, thùng rác, khôi phục, xoá hẳn, xuất và nhập sao lưu, đổi ngôn ngữ) SHALL hoạt động khi không có mạng, kể cả khi đã đăng nhập. Khi đã đăng nhập, các chức năng Chia tiền trên nhóm đã có trên máy (xem nhóm và kết quả, tạo nhóm, thêm và sửa thành viên khách, thêm, sửa, xoá, khôi phục món, đánh dấu đã trả) SHALL cũng hoạt động khi không có mạng. Chỉ đăng ký, đăng nhập, quên mật khẩu, đồng bộ, lấy hoặc đổi link mời, vào nhóm bằng link, rời nhóm, xoá và khôi phục nhóm cần mạng; thay đổi làm lúc offline MUST được đồng bộ tự động khi có mạng trở lại.

#### Scenario: Mở app khi mất mạng
- **WHEN** thiết bị ở chế độ máy bay và người dùng mở app đã từng dùng
- **THEN** màn chính hiện ra đầy đủ dữ liệu và ghi nợ được

#### Scenario: Xoá và khôi phục khi mất mạng
- **WHEN** thiết bị ở chế độ máy bay, người dùng xoá một người rồi mở Thùng rác và khôi phục
- **THEN** cả hai thao tác thành công và người đó trở lại danh sách

#### Scenario: Đã đăng nhập nhưng mất mạng
- **WHEN** người dùng đã đăng nhập, mất mạng, ghi nợ 3 lần rồi có mạng lại
- **THEN** cả 3 lần ghi nợ đều lưu ngay trên máy và tự lên server khi có mạng

#### Scenario: Ghi món chia tiền khi mất mạng
- **WHEN** người dùng đã đăng nhập, từng mở nhóm "Đà Lạt", đang ở chế độ máy bay, mở màn Chia tiền và thêm món "Cà phê"
- **THEN** màn Chia tiền và nhóm "Đà Lạt" mở được, món được lưu và kết quả tính lại ngay, rồi món tự lên server khi có mạng

### Requirement: Cài đặt như ứng dụng
App SHALL cài được ra màn hình chính điện thoại, mở ở chế độ toàn màn hình không có thanh địa chỉ, có tên và biểu tượng riêng.

#### Scenario: Mở từ màn hình chính
- **WHEN** người dùng đã cài app và mở từ biểu tượng trên màn hình chính
- **THEN** app mở ở chế độ toàn màn hình không có thanh địa chỉ trình duyệt

### Requirement: Lưu trữ bền vững
Khi lưu giao dịch đầu tiên, hệ thống SHALL xin trình duyệt cấp quyền lưu trữ bền vững. Nếu trình duyệt từ chối hoặc không hỗ trợ, hệ thống MUST vẫn hoạt động bình thường.

#### Scenario: Trình duyệt không hỗ trợ
- **WHEN** trình duyệt không hỗ trợ lưu trữ bền vững
- **THEN** app vẫn ghi nợ bình thường, không báo lỗi

### Requirement: Gợi ý cài ra màn hình chính
Khi app đang chạy trong trình duyệt (chưa cài) và sổ đã có ít nhất một giao dịch, hệ thống SHALL hiển thị lời gợi ý cài app ra màn hình chính **bên trong menu phụ**, giải thích rằng việc này giúp giữ dữ liệu an toàn hơn. Màn chính MUST NOT hiển thị thẻ gợi ý này (để không rối mắt); thay vào đó nút menu `[=]` SHALL có một chấm báo nhỏ khi còn gợi ý chưa đóng. Trên iPhone, lời gợi ý MUST hướng dẫn thao tác "Chia sẻ → Thêm vào Màn hình chính". Người dùng MUST đóng được lời gợi ý; sau khi đóng thì chấm báo biến mất và không hiện lại.

#### Scenario: Gợi ý trên iPhone
- **WHEN** người dùng dùng app trong Safari trên iPhone, chưa cài, đã có giao dịch, và mở menu
- **THEN** menu hiện hướng dẫn "Chia sẻ → Thêm vào Màn hình chính" có nút đóng

#### Scenario: Màn chính gọn
- **WHEN** app chưa cài và sổ đã có giao dịch
- **THEN** màn chính không có thẻ gợi ý cài app, chỉ có chấm báo trên nút `[=]`

### Requirement: Cập nhật phiên bản không làm gián đoạn
Khi có phiên bản app mới, hệ thống SHALL tải ngầm bản mới và kiểm tra bản mới mỗi lần app được mở hoặc quay lại từ nền. Khi bản mới đã tải xong:
- Nếu người dùng đang ở màn chính Ghi nợ hoặc màn danh sách Chia tiền, không mở form hay hộp thoại nào, và app vừa được mở hoặc vừa quay lại từ nền, hệ thống SHALL áp dụng bản mới ngay (tải lại trang một lần).
- Ở mọi trường hợp khác, hệ thống SHALL hiện thanh "Có bản mới — Cập nhật"; bấm Cập nhật MUST áp dụng bản mới và tải lại trang.

Hệ thống MUST NOT tự tải lại trang khi người dùng đang ở giữa một thao tác nhập liệu (ghi nợ, trừ nợ, thêm hoặc sửa chi tiêu, sửa người nợ, tạo nhóm). Tải lại trang (kể cả nhiều lần) MUST NOT khiến người dùng kẹt ở bản cũ khi bản mới đã tải xong và đã được áp dụng. Trong một phiên, mọi màn MUST chạy cùng một phiên bản; chuyển giữa các màn MUST NOT đưa người dùng về phiên bản khác.

#### Scenario: Có bản mới khi đang ghi nợ
- **WHEN** có phiên bản mới trong lúc người dùng đang nhập số tiền
- **THEN** màn hình không bị tải lại, dữ liệu đang nhập không mất, và thanh "Có bản mới — Cập nhật" hiện ra

#### Scenario: Mở app khi đã có bản mới
- **WHEN** bản mới đã được tải ngầm, người dùng mở app (hoặc quay lại app từ nền) và đang ở màn chính
- **THEN** app tự tải lại một lần và chạy bản mới

#### Scenario: Bấm Cập nhật
- **WHEN** thanh "Có bản mới — Cập nhật" đang hiện và người dùng bấm Cập nhật
- **THEN** trang tải lại và chạy bản mới; tải lại thêm lần nữa vẫn là bản mới

#### Scenario: Không nhảy về bản cũ khi chuyển màn
- **WHEN** đã deploy bản mới có thêm màn mới, người dùng đang dùng app rồi chuyển qua lại giữa màn cũ và màn mới
- **THEN** mọi màn đều chạy cùng một phiên bản (không có màn nào mất đi tính năng của bản đang chạy)

### Requirement: Xem phiên bản và kiểm tra bản mới
Menu phụ SHALL hiển thị mã phiên bản app đang chạy và nút "Kiểm tra bản mới". Bấm nút MUST hỏi server có bản mới không: nếu có, tải bản mới rồi hiện thanh "Có bản mới — Cập nhật"; nếu không, báo "Đang dùng bản mới nhất"; nếu không có mạng, báo cần kết nối.

#### Scenario: Kiểm tra khi đã mới nhất
- **WHEN** người dùng mở menu và bấm "Kiểm tra bản mới" khi máy đã ở bản mới nhất
- **THEN** app báo "Đang dùng bản mới nhất" và hiện mã phiên bản

#### Scenario: Kiểm tra khi mất mạng
- **WHEN** thiết bị offline và người dùng bấm "Kiểm tra bản mới"
- **THEN** app báo cần kết nối mạng, app vẫn dùng bình thường
