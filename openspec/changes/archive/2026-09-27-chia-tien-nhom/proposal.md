# Proposal

## Why

Khi đi chơi theo nhóm, mọi người đang ghi chi tiêu vào ghi chú điện thoại rồi tự cộng trừ tay ("Lẩu 700k :4 = 175k… T trả lại 216k"). Cách này dễ nhầm, và chỉ người cầm điện thoại mới biết con số. App đã có tài khoản và đồng bộ lên server, nên giờ có thể làm chế độ **Chia tiền**: cả nhóm cùng ghi chi tiêu trên máy của mình, và app tự tính ai phải trả ai bao nhiêu.

## What Changes

- **Công tắc chế độ trên header màn chính.** Chọn giữa `Ghi nợ | Chia tiền`, app nhớ chế độ dùng lần cuối. Phần Ghi nợ giữ nguyên hành vi.
- **Chia tiền cần đăng nhập.** Chưa đăng nhập thì màn Chia tiền mời đăng nhập. Phần Ghi nợ vẫn dùng được khi không có tài khoản.
- **Nhóm.** Tạo nhóm, đặt tên nhóm. Danh sách nhóm hiện tổng chi và số tiền mình được trả hoặc phải trả. Nhóm đã cân bằng hiện "Đã xong".
- **Thành viên.**
  - Mỗi thành viên có tên và số suất (mặc định 1; một "nhà" có thể là 2 suất).
  - Thành viên có thể là **khách** (chỉ có tên) hoặc gắn với một tài khoản.
  - Đổi tên và đổi số suất được.
  - Chỉ xoá được khách chưa dính món nào.
- **Chi tiêu.**
  - Mỗi món gồm tên món, số tiền, **một người trả** và **danh sách người cùng chia**. Mặc định chia cho tất cả; bỏ tích những ai không dùng món đó.
  - Tiền được chia theo suất. Phần dư lẻ đồng được dồn theo quy tắc cố định, nên máy nào tính cũng ra cùng kết quả.
- **Kết quả.**
  - Liệt kê "A → B: số tiền" với số lần chuyển tiền ít nhất.
  - Nút "Đánh dấu đã trả" tạo một dòng thanh toán. Được trả một phần.
- **Quyền và lịch sử.**
  - Mọi thành viên có tài khoản đều thêm, sửa, xoá mềm, khôi phục món và dòng thanh toán được.
  - Mọi thay đổi được lưu lịch sử: ai làm, lúc nào, trước và sau.
- **Mời và nhận vị trí.**
  - Link mời chia sẻ qua Zalo hoặc QR. Ai có link đều vào được nhóm.
  - Khi vào, người dùng chọn "Tôi là <tên khách>" để nhận vị trí khách, hoặc vào như thành viên mới.
  - Người tạo nhóm đổi được link để link cũ hết hiệu lực.
- **Rời nhóm.** Chỉ rời được khi số dư của mình bằng 0. Rời xong, vị trí của mình trở lại thành khách để số liệu cũ không lệch.
- **Xoá nhóm.** Chỉ người tạo được xoá. Nhóm vào thùng rác 30 ngày và khôi phục được. Sau 30 ngày nhóm tự ẩn hẳn nhưng vẫn còn trên server.
- **Đồng bộ nhóm giữa nhiều tài khoản.**
  - Máy tải thay đổi khi mở app, sau mỗi thao tác, khi có mạng lại và mỗi 60 giây.
  - Tạo nhóm và ghi món được khi offline. Lấy link mời và vào nhóm bằng link thì cần mạng.
  - Server chỉ nhận và trả dữ liệu của những nhóm mà người gửi đang là thành viên.
- **Đăng xuất.** Dữ liệu nhóm trên máy luôn bị xoá khi đăng xuất, vì nhóm gắn với tài khoản. Còn thay đổi chưa gửi thì phải cảnh báo trước.
- **Ngoài phạm vi, làm sau.**
  - Nối kết quả chia tiền sang sổ nợ.
  - Nhập số tiền cụ thể cho từng người.
  - Một món có nhiều người trả.
  - Đẩy thông báo.
  - Mời bằng cách tìm số điện thoại.
  - Tiền tệ khác VND.

## Capabilities

### New Capabilities
- `group-expenses`: nhóm chia tiền trên một máy: tạo và xoá nhóm, thành viên và suất, món chi tiêu với người trả và người cùng chia, cách chia và làm tròn, kết quả ai trả ai, đánh dấu đã trả, lịch sử sửa, thùng rác nhóm.
- `group-sharing`: dùng chung nhóm giữa nhiều tài khoản: link mời, vào nhóm và nhận vị trí khách, rời nhóm, đổi link, đồng bộ nhóm giữa các thành viên, kiểm soát quyền truy cập trên server, xử lý khi hai người sửa cùng lúc.

### Modified Capabilities
- `home-screen`: bố cục màn chính có thêm công tắc `Ghi nợ | Chia tiền` trên header, và app nhớ chế độ dùng lần cuối.
- `user-account`: đăng xuất luôn xoá dữ liệu nhóm trên máy, có cảnh báo nếu còn thay đổi nhóm chưa gửi.
- `offline-app-shell`: danh sách chức năng chạy offline có thêm xem nhóm, ghi, sửa và xoá món, đánh dấu đã trả. Mã của phần Chia tiền không được tính vào ngân sách JavaScript của màn chính.

## Impact

- **Server.**
  - Thêm 4 bảng Postgres (`groups`, `group_members`, `expenses`, `group_events`) qua migration drizzle.
  - Thêm endpoint `POST /api/groups/sync` và các endpoint mời, vào nhóm, rời nhóm, đổi link trong `server/groups*.ts`.
  - Tách phần tính chia tiền thành thư viện thuần TS dùng chung cho máy và server (`lib/split/`).
- **Máy.**
  - Dexie lên bản 4 với 4 bảng nhóm có đánh dấu `_dirty`.
  - Thêm lớp đồng bộ nhóm trong `lib/groups/sync`, gắn vào bộ lập lịch đồng bộ hiện có.
  - Thêm các trang `/chia-tien/`, `/chia-tien/nhom/`, `/chia-tien/mon/`, `/chia-tien/tham-gia/`, đều tải lười.
  - Thêm chuỗi i18n riêng `lib/i18n/groups.ts`.
- **Ngân sách.** Màn chính đang dùng 178,3/180KB. Chỉ công tắc header được nằm trong bundle màn chính, còn lại tải lười.
- **Không đổi.** Giao thức `/api/sync` của sổ nợ và dữ liệu sổ nợ hiện có không thay đổi.
- **Chi phí.** Vẫn nằm trong gói miễn phí của Neon và Vercel, vì đồng bộ theo chu kỳ 60 giây và không dùng realtime.
