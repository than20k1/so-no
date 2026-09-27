# Tasks

## 1. Thư viện chia tiền (`lib/split/`)

- [x] 1.1 Viết `computeShares` (chia theo suất, làm tròn xuống, dồn phần dư theo `order_key` rồi `id`). Kiểm tra bằng unit test: 100.000 chia 3 ra 33.334/33.333/33.333, và tổng phần góp luôn bằng số tiền.
- [x] 1.2 Viết `balances` (món + dòng thanh toán, bỏ dòng đã xoá) và `settle` (tham lam, thứ tự cố định). Kiểm tra bằng unit test: ví dụ ghi chú ra "Nhà T → Nhà Hùng: 216.000", ví dụ 3 người, và test ngẫu nhiên (tổng số dư bằng 0, áp kết quả xong ai cũng về 0, tối đa n−1 lần chuyển).

## 2. Server: schema và đồng bộ nhóm

- [x] 2.1 Thêm bảng `groups`, `group_members`, `expenses`, `group_events`, `group_invites` vào `server/db/schema.ts`, rồi sinh `0001_groups.sql` bằng drizzle-kit. Kiểm tra bằng `server/migrate.test.ts`: migrate trên PGlite tạo đủ bảng và index `(group_id, seq)`.
- [x] 2.2 Viết phần kiểm tra dữ liệu vào và luật gộp khi đẩy (D4): chặn khi không phải thành viên, member phải thuộc cùng nhóm, `member_in_use`, nhóm mới được gắn người tạo, `user_id` không đổi qua sync. Kiểm tra bằng test trong `server/groups-sync.test.ts` cho từng lý do từ chối.
- [x] 2.3 Viết phần kéo theo con trỏ từng nhóm, gồm `groups`, `revoked`, trang 1000 và `hasMore`, cùng khoá `FOR UPDATE`/`FOR SHARE` theo thứ tự id (D2, D3). Kiểm tra bằng test: người vào sau tải được toàn bộ lịch sử; hai lượt đồng bộ song song không làm hụt dòng; người đã rời nằm trong `revoked` và không nhận món mới.
- [x] 2.4 Tự ẩn nhóm đã xoá quá 30 ngày theo giờ server (D10). Kiểm tra bằng test giả thời gian: ngày 29 còn khôi phục được, ngày 31 nhóm vào `revoked` nhưng vẫn còn trong DB.
- [x] 2.5 Mount route `POST /api/groups/sync` (bodyLimit 1MB, tối đa 500 dòng, 401 khi chưa đăng nhập). Kiểm tra bằng test HTTP qua `server/test/harness.ts`.

## 3. Server: mời, vào, rời, xoá nhóm

- [x] 3.1 Viết `invite` và `invite/reset` (token 32 byte, chỉ người tạo được reset, so sánh constant-time). Kiểm tra bằng test: mọi thành viên lấy được cùng một link; người không phải người tạo bị 403 khi reset; token cũ hết hiệu lực sau khi reset.
- [x] 3.2 Viết `join/preview` và `join` (nhận vị trí khách hoặc vào như người mới, 409 `taken`, một tài khoản chỉ một vị trí mỗi nhóm, người đã là thành viên thì được đưa thẳng vào, có giới hạn tần suất, ghi event). Kiểm tra bằng test: hai tài khoản cùng nhận một vị trí thì chỉ một được; dò token sai quá giới hạn thì bị chặn.
- [x] 3.3 Viết `leave` (kiểm tra số dư bằng 0 bằng `lib/split`, trả vị trí về thành khách, ghi event) và `delete`/`restore` (chỉ người tạo). Kiểm tra bằng test: còn nợ thì không rời được; rời xong vị trí thành khách và món giữ nguyên; người khác không xoá được nhóm.

## 4. Máy: dữ liệu và đồng bộ

- [x] 4.1 Nâng Dexie lên bản 4 với 4 bảng nhóm, mở rộng `SYNCED_TABLES`/`SYNCED_FIELDS`. Kiểm tra bằng `migration.test.ts`: nâng từ bản 3 lên thì sổ cũ còn nguyên và ghi vào nhóm có `_dirty=1`.
- [x] 4.2 Viết `lib/groups/` gồm các thao tác trên máy: tạo nhóm, thêm/sửa/xoá khách, thêm/sửa/xoá/khôi phục món, đánh dấu đã trả, đổi tên nhóm. Mỗi thao tác ghi dòng và event trong một transaction. Kiểm tra bằng unit test, gồm cả trường hợp chặn xoá thành viên đã dính món và chặn trùng tên.
- [x] 4.3 Viết `lib/groups/sync.ts` (`syncGroupsOnce`: gom lô, áp kết quả với `markRemoteWrite`, xử lý `revoked`, bỏ đánh dấu `_dirty` an toàn). Kiểm tra bằng unit test với server PGlite: hai "máy" cùng ghi offline rồi gộp đủ dòng; sửa chồng nhau thì bản đến sau thắng và lịch sử giữ đủ.
- [x] 4.4 Gắn vào bộ lập lịch (`import()` động sau `syncOnce`, lỗi nhóm không chặn sổ nợ, bỏ lượt định kỳ khi không có nhóm), đồng thời `pendingCount` cộng dòng nhóm. Kiểm tra bằng `lib/sync/index.test.ts`: nhóm lỗi 500 thì sổ nợ vẫn đồng bộ; tài khoản không có nhóm thì không gọi endpoint mỗi 60 giây.
- [x] 4.5 Đăng xuất luôn xoá dữ liệu nhóm và cảnh báo khi còn dòng nhóm chưa gửi (delta `user-account`). Kiểm tra bằng test của `AccountSection`/`logout`.
- [x] 4.6 Viết `lib/groups/api.ts` cho `invite`, `reset`, `preview`, `join`, `leave`, `delete`, `restore`, báo rõ khi offline. Kiểm tra bằng unit test với fetch giả.

## 5. Giao diện

- [x] 5.1 Thêm công tắc `ModeSwitch` ở header, nhớ chế độ bằng `localStorage`, script chuyển trang trước khi hydrate ở `/` (không cần `?stay` — xem design D9). Kiểm tra: `npm run build` và script budget vẫn ≤ 180KB; e2e mở lại app thì vào đúng chế độ, lần đầu mở thì vào Ghi nợ; ở 360x640 vẫn thấy hai nút lớn.
- [x] 5.2 Thêm `lib/i18n/groups.ts` (vi/en) và `useGroupsT`. Kiểm tra: đổi sang English thì màn Chia tiền đổi chữ, và lint/typecheck sạch.
- [x] 5.3 Làm màn `/chia-tien/`: chưa đăng nhập thì mời đăng nhập; có danh sách nhóm, "Đã xong", nút Tạo nhóm (tên nhóm + tên của mình), và phần "Nhóm đã xoá" cho người tạo. Thêm hỗ trợ `?next=` an toàn cho đăng nhập (chỉ đường dẫn tương đối). Kiểm tra bằng e2e: đăng nhập xong quay lại Chia tiền; `next=//evil.com` bị bỏ qua.
- [x] 5.4 Làm màn chi tiết nhóm `/chia-tien/nhom/`: tab Chi tiêu (có mục "Đã xoá"), Kết quả (có "Đánh dấu đã trả", trả một phần), Thành viên (thêm khách, đổi tên, đổi suất, xoá khi được phép, rời nhóm), Lịch sử. Kiểm tra bằng component test cho kết quả và lịch sử.
- [x] 5.5 Làm màn thêm/sửa món `/chia-tien/mon/`: nhập tiền kiểu chợ, chọn người trả, tích người cùng chia kèm số suất riêng cho món, dòng thanh toán, toast Hoàn tác khi xoá. Kiểm tra bằng e2e: nhập đúng ví dụ ghi chú thì Kết quả hiện "Nhà T → Nhà Hùng: 216.000".
- [x] 5.6 Thêm "Mời bạn" (share hoặc copy, QR tải lười, người tạo đổi được link) và màn `/chia-tien/tham-gia/` (đọc `#token`, giữ token qua `sessionStorage` khi phải đăng nhập, chọn "Tôi là …" hoặc "Người mới", báo khi vị trí đã có người nhận hoặc link hết hạn). Kiểm tra bằng e2e trong mục 6.
- [x] 5.7 Để service worker precache các trang `/chia-tien/*`. Kiểm tra bằng e2e offline: mở nhóm đã có và thêm món ở chế độ máy bay.

## 6. Kiểm thử tích hợp và hoàn tất

- [x] 6.1 Viết e2e hai người (`e2e/groups.spec.ts`, hai browser context, API PGlite): A tạo nhóm, thêm khách "Hùng" và các món; B mở link, đăng ký, chọn "Tôi là Hùng", thấy đủ món; B thêm món thì A thấy sau `syncNow`; B trả hết và rời nhóm; A đổi link thì link cũ không vào được.
- [x] 6.2 Chạy toàn bộ `npm test`, `npx playwright test`, lint, build và kiểm tra budget, tất cả phải xanh. Cập nhật README (mục Chia tiền, endpoint mới).
- [ ] 6.3 Deploy Production và thử thật trên 2 điện thoại của 2 tài khoản: tạo nhóm, gửi link qua Zalo, nhận vị trí khách, cùng ghi món, đánh dấu đã trả.
