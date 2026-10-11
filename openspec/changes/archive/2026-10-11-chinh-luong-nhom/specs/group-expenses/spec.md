## MODIFIED Requirements

### Requirement: Tạo nhóm
Người dùng SHALL tạo được nhóm mới bằng cách nhập tên nhóm (bắt buộc, tối đa 200 ký tự), tên trưởng nhóm — ô có nhãn "Tên trưởng nhóm (tài khoản này)" (bắt buộc; điền sẵn tên đã dùng lần gần nhất trên máy) — và danh sách thành viên (không bắt buộc) trong một ô nhiều dòng, mỗi dòng một người. Dòng trống và khoảng trắng đầu/cuối MUST được bỏ qua. Khi người dùng gõ, form SHALL hiện số người của nhóm sẽ tạo (trưởng nhóm cộng các thành viên).

Nhóm mới MUST có sẵn trưởng nhóm là thành viên đầu tiên, gắn với tài khoản người tạo, với 1 suất, rồi tới các thành viên trong danh sách theo đúng thứ tự đã gõ, mỗi người là khách với 1 suất. Tên thành viên MUST theo cùng quy tắc như khi thêm thành viên. Nếu có hai tên trùng nhau sau khi bỏ dấu và chuyển chữ thường (giữa các dòng với nhau hoặc với tên trưởng nhóm), hệ thống MUST NOT tạo nhóm và MUST báo lỗi nêu rõ tên bị trùng và số lần trùng. Tổng số người MUST NOT vượt quá giới hạn thành viên của một nhóm; vượt thì báo lỗi và không tạo. Tạo nhóm (kể cả kèm danh sách thành viên) MUST hoàn tất được khi không có mạng.

#### Scenario: Tạo nhóm khi mất mạng
- **WHEN** người dùng đã đăng nhập, đang offline, tạo nhóm "Đà Lạt"
- **THEN** nhóm "Đà Lạt" xuất hiện ngay trong danh sách với một thành viên là chính người dùng, và lên server khi có mạng

#### Scenario: Tạo nhóm kèm danh sách thành viên
- **WHEN** người dùng nhập tên nhóm "Đà Lạt", tên trưởng nhóm "Thân", và ô thành viên gồm ba dòng "Vũ", "Hoàng", "Lương"
- **THEN** form hiện "4 người", và sau khi tạo nhóm có "Thân" (tài khoản) cùng ba khách "Vũ", "Hoàng", "Lương", mỗi người 1 suất, theo đúng thứ tự đó

#### Scenario: Tên trùng trong danh sách
- **WHEN** ô thành viên có hai dòng "Vũ" và "vu"
- **THEN** hệ thống báo "Có 2 người tên “Vũ” trùng nhau" và không tạo nhóm, nội dung đã gõ vẫn còn

#### Scenario: Trùng tên trưởng nhóm
- **WHEN** tên trưởng nhóm là "Thân" và ô thành viên có dòng "thân"
- **THEN** hệ thống báo tên "Thân" bị trùng và không tạo nhóm

#### Scenario: Bỏ qua dòng trống
- **WHEN** ô thành viên gồm "Vũ", một dòng trống, và "  Hoàng  "
- **THEN** nhóm được tạo với hai khách "Vũ" và "Hoàng"

### Requirement: Ghi món chi tiêu
Trong màn nhóm, nút mở màn nhập khoản chi SHALL có nhãn "+ Thêm chi tiêu" và dùng màu xanh lá (màu của thao tác "Trừ nợ"), không dùng màu đỏ của "Ghi nợ". Màn nhập MUST có tiêu đề "Thêm chi tiêu".

Người dùng SHALL thêm món chi tiêu gồm: tên món (bắt buộc, tối đa 200 ký tự), số tiền, đúng một người trả, và danh sách người cùng chia (ít nhất một người). Ô số tiền MUST dùng cùng quy tắc nhập tiền kiểu chợ như màn Ghi nợ (gõ 54 thành 54.000) và số tiền MUST là số nguyên từ 1 đến 1.000.000.000 đồng. Người trả mặc định MUST là thành viên gắn với tài khoản đang dùng. Danh sách người cùng chia mặc định MUST là tất cả thành viên với số suất hiện tại của họ; người dùng SHALL bỏ tích hoặc đổi số suất của từng người cho riêng món đó. Người trả MUST NOT bắt buộc có trong danh sách người cùng chia. Lưu món MUST hoàn tất được khi không có mạng.

#### Scenario: Nút thêm chi tiêu
- **WHEN** người dùng mở một nhóm
- **THEN** nút "+ Thêm chi tiêu" màu xanh lá hiện ở tab Chi tiêu, bấm vào mở màn "Thêm chi tiêu"

#### Scenario: Món chia cho cả nhóm
- **WHEN** nhóm có "Nhà T" (2 suất) và "Nhà Hùng" (2 suất), người dùng thêm "Lẩu + nước" gõ 700, người trả "Nhà Hùng", giữ nguyên danh sách chia
- **THEN** món được lưu 700.000, mỗi suất 175.000, "Nhà T" phải góp 350.000 và "Nhà Hùng" phải góp 350.000

#### Scenario: Món trả hộ người khác
- **WHEN** người dùng thêm "Bún đậu" 54.000, người trả "Nhà T", và chỉ tích "Nhà Hùng" trong danh sách chia
- **THEN** "Nhà Hùng" phải góp toàn bộ 54.000 và "Nhà T" không phải góp gì cho món này

#### Scenario: Không chọn ai cùng chia
- **WHEN** người dùng bỏ tích hết mọi người rồi bấm Lưu
- **THEN** hệ thống báo cần chọn ít nhất một người và không lưu
