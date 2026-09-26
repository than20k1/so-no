# Spec Delta

## Purpose

Bảo đảm app mở cực nhanh và dùng được khi không có mạng ở chợ: cài được ra màn hình chính, chạy hoàn toàn offline sau lần mở đầu, và giảm rủi ro trình duyệt tự xóa dữ liệu sổ nợ.

## ADDED Requirements

### Requirement: Tải nhanh
Màn chính SHALL hiển thị hai nút "Ghi nợ" và "Trừ nợ" có thể bấm được trong vòng 2 giây ở lần mở đầu tiên trên mạng 4G chậm (theo cấu hình giả lập "Slow 4G" và CPU chậm 4 lần), và trong vòng 1 giây ở các lần mở sau. Tổng dung lượng JavaScript tải cho màn chính (đã nén) MUST NOT vượt quá 180KB. Script chỉ dành cho trình duyệt cũ (`nomodule`) không tính vào ngân sách.

#### Scenario: Mở lần sau
- **WHEN** người dùng mở lại app đã từng mở trước đó
- **THEN** hai nút lớn bấm được trong vòng 1 giây

### Requirement: Hoạt động offline
Sau lần mở đầu tiên thành công, toàn bộ chức năng của bản này (ghi nợ, trừ nợ, xem danh sách, xem chi tiết, hoàn tác, xuất và nhập sao lưu, đổi ngôn ngữ) SHALL hoạt động khi không có mạng.

#### Scenario: Mở app khi mất mạng
- **WHEN** thiết bị ở chế độ máy bay và người dùng mở app đã từng dùng
- **THEN** màn chính hiện ra đầy đủ dữ liệu và ghi nợ được

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
Khi app đang chạy trong trình duyệt (chưa cài) và sổ đã có ít nhất một giao dịch, hệ thống SHALL hiển thị lời gợi ý cài app ra màn hình chính, giải thích rằng việc này giúp giữ dữ liệu an toàn hơn. Trên iPhone, lời gợi ý MUST hướng dẫn thao tác "Chia sẻ → Thêm vào Màn hình chính". Người dùng MUST đóng được lời gợi ý và lời gợi ý không được chặn thao tác ghi/trừ nợ.

#### Scenario: Gợi ý trên iPhone
- **WHEN** người dùng dùng app trong Safari trên iPhone, chưa cài, và đã có giao dịch
- **THEN** app hiện hướng dẫn "Chia sẻ → Thêm vào Màn hình chính" có nút đóng

### Requirement: Cập nhật phiên bản không làm gián đoạn
Khi có phiên bản app mới, hệ thống SHALL tải ngầm và áp dụng ở lần mở sau, MUST NOT tự tải lại trang khi người dùng đang ở giữa một thao tác ghi hoặc trừ nợ.

#### Scenario: Có bản mới khi đang ghi nợ
- **WHEN** có phiên bản mới trong lúc người dùng đang nhập số tiền
- **THEN** màn hình không bị tải lại và dữ liệu đang nhập không mất
