# Tasks

## 1. Chuẩn bị

- [x] 1.1 Archive change `sua-xoa-nguoi-no` (`/opsx:archive`). Kiểm tra: `openspec list --specs` có `debtor-management`, và `openspec validate dang-nhap-dong-bo --strict` vẫn hợp lệ
- [x] 1.2 Cài thư viện: `hono`, `better-auth`, `drizzle-orm`, `pg`, `nodemailer`; dev: `drizzle-kit`, `@electric-sql/pglite`, `@hono/node-server`, `@types/pg`, `@types/nodemailer`. Kiểm tra: `npm run build` qua và JS màn chính không đổi (177,7KB)
- [x] 1.3 Biến môi trường: sinh `BETTER_AUTH_SECRET`; người dùng tạo Gmail App Password; thêm `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` vào Vercel (Production + Preview) và `.env.local`. Kiểm tra: script in ra đủ tên biến có giá trị (không in giá trị) ở cả local và `vercel env ls`
- [x] 1.4 `vercel.json` thêm `"regions": ["sin1"]`; `gen-sw.mjs` bỏ qua `/api/*`. Kiểm tra: unit test hoặc đọc `out/sw.js` thấy điều kiện `/api/`; e2e cũ vẫn qua

## 2. Nền server

- [x] 2.1 Schema Drizzle `server/db/schema.ts` (bảng Better Auth + `books`, `debtors`, `transactions`, `debtor_events`, `login_throttle`, sequence `sync_seq`, chỉ mục `(book_id, seq)`), sinh migration, lệnh `npm run db:migrate`, và `server/db/client.ts` chọn `pg` hoặc PGlite theo `DATABASE_URL`. Kiểm tra: test chạy migration trên PGlite ra đủ bảng; chạy `db:migrate` trên nhánh Neon `dev` rồi liệt kê được các bảng
- [x] 2.2 `server/app.ts` (Hono, `GET /api/health`), `api/index.ts` (Vercel), `scripts/api-dev.mjs` (Node, cổng 3101), `scripts/serve.mjs` chuyển `/api` sang API. Kiểm tra: `npm run dev:api` + `npm run serve` thì `curl localhost:3100/api/health` trả `{ ok: true }` kèm kết nối DB
- [x] 2.3 Spike Better Auth trên PGlite: cấu hình `emailAndPassword` + `emailOTP` + `phoneNumber` như design D3, chạy thử đăng ký → OTP → xác nhận → đăng nhập bằng SĐT + mật khẩu; đăng nhập khi chưa xác nhận bị chặn; đặt lại mật khẩu bằng OTP. Kiểm tra: test spike qua; ghi lại vào design.md mọi chỗ phải làm khác D3

## 3. API tài khoản

- [x] 3.1 `server/phone.ts`: chuẩn hoá SĐT Việt Nam về `+84…` và kiểm tra hợp lệ. Kiểm tra: unit test với "0912 345 678", "0912345678", "+84912345678", "84912345678", số sai đầu, số thiếu chữ số
- [x] 3.2 `server/mail.ts`: Gmail SMTP qua nodemailer, hộp thư bộ nhớ khi `E2E_TEST=1`, `GET /api/test/outbox` chỉ có khi `E2E_TEST=1`. Kiểm tra: unit test thấy mail trong hộp thư bộ nhớ; không có `E2E_TEST` thì `/api/test/outbox` trả 404
- [x] 3.3 `POST /api/account/register`, `verify`, `resend` (tối đa 1 lần/60 giây), tạo sổ server khi xác nhận xong. Kiểm tra: test tích hợp (Hono `app.request` + PGlite) cho đăng ký thành công, mật khẩu ngắn, SĐT/email trùng (kể cả SĐT viết khác kiểu), mã sai 5 lần bị vô hiệu, mã hết hạn sau 10 phút, gửi lại quá sớm bị từ chối
- [x] 3.4 `POST /api/account/login` với khoá 5 lần sai/15 phút và chặn email chưa xác nhận. Kiểm tra: test đăng nhập đúng; sai 5 lần rồi đúng vẫn bị khoá; sau 15 phút mở lại; thông báo sai giống nhau dù SĐT có hay không có tài khoản
- [x] 3.5 `POST /api/account/forgot` và `reset`: che email, không lộ SĐT không tồn tại, thu hồi mọi phiên, xoá khoá. Kiểm tra: test đặt lại xong mật khẩu cũ hỏng, phiên cũ bị 401, SĐT không tồn tại trả cùng dạng phản hồi
- [x] 3.6 `POST /api/account/logout`, `GET /api/account/me`; kiểm tra `Origin` và `Content-Type` cho các POST. Kiểm tra: test `me` trả `{ userId, phone, bookId }` khi có phiên và 401 khi không; POST sai `Origin` bị từ chối

## 4. API đồng bộ

- [x] 4.1 `POST /api/sync` phần đẩy: gán sổ theo phiên, gộp theo D7 (giao dịch và sự kiện chỉ thêm, hủy không bỏ được, người nợ theo bản tới sau cùng, cấp `seq`), validate và giới hạn kích thước. Kiểm tra: test đẩy lại cùng dữ liệu không nhân đôi; hủy ở một máy thắng; hai lần đổi tên thì bản sau thắng và cả hai sự kiện còn; dòng có id thuộc sổ khác bị `foreign`; không phiên → 401
- [x] 4.2 Phần kéo: trả dòng `seq > cursor` theo trang 1000 dòng, `hasMore`, `serverNow`. Kiểm tra: test hai "máy" (hai phiên cùng tài khoản) đẩy/kéo xen kẽ ra cùng dữ liệu; 2500 dòng kéo đủ qua 3 trang
- [x] 4.3 Thùng rác theo giờ server: `server_deleted_at`, từ chối `purge_too_early`, tự xoá hẳn khi đủ 30 ngày, máy không bỏ được `purged_at`. Kiểm tra: test với giờ server giả lập ở ngày 14, 16, 31
- [x] 4.4 `scripts/admin-restore.mjs` (mặc định chạy thử, `--apply` mới ghi, thêm sự kiện `restore` từ `admin`). Kiểm tra: test trên PGlite: người đã xoá hẳn được khôi phục và xuất hiện ở lượt kéo tiếp theo của tài khoản

## 5. Đồng bộ phía trình duyệt

- [x] 5.1 Dexie version 3: chỉ mục `_dirty`, hook đánh dấu, upgrade đánh dấu mọi dòng cũ. Kiểm tra: unit test: ghi nợ/sửa/hủy → `_dirty = 1`; ghi với `_dirty: 0` không bị đánh dấu lại; DB version 2 có dữ liệu nâng lên version 3 thì mọi dòng `_dirty = 1`
- [x] 5.2 `lib/sync/engine.ts`: một lượt đẩy lô 500 rồi kéo tới hết `hasMore`; áp dữ liệu kéo về theo D8; bỏ `_dirty` an toàn; tính lại số dư; lưu `cursor`, `serverOffset`, thời điểm đồng bộ gần nhất; xử lý `rejected`. Kiểm tra: unit test chạy engine với `fetch` nối thẳng vào `app.request` của server + PGlite: hai máy offline cùng ghi rồi đồng bộ ra số dư 120.000 như spec; sửa dòng trong lúc đang đẩy vẫn giữ `_dirty`; `purge_too_early` làm người đó trở lại thùng rác
- [x] 5.3 Gắn sổ với tài khoản (D9): máy chưa từng đăng nhập thì đổi `bookId` và gộp; khác tài khoản thì báo để chọn xoá sổ hoặc huỷ. Kiểm tra: unit test: sổ 3 người trên máy + tài khoản có 5 người → 8 người trên cả hai; khác tài khoản không gửi dòng nào lên
- [x] 5.4 `lib/sync/index.ts`: `start()` với các điểm kích hoạt (mở app, sau thay đổi debounce 2 giây, `online`, trang hiện lại, mỗi 60 giây), chỉ một lượt một lúc, backoff khi lỗi mạng, 401 → trạng thái "cần đăng nhập lại"; kho trạng thái cho menu; `Providers` tải lười khi có đánh dấu `so-no.account`. Kiểm tra: unit test backoff và 401; `npm run build` thấy JS màn chính tăng dưới 1KB và ≤ 180KB
- [x] 5.5 `trashState`/`purgeExpired` dùng `Date.now() + serverOffset` khi đã đăng nhập. Kiểm tra: unit test với `serverOffset` âm 20 ngày thì chưa cho xoá hẳn dù giờ máy đã qua 20 ngày

## 6. Giao diện

- [x] 6.1 Chuỗi vi/en cho đăng ký, đăng nhập, OTP, quên mật khẩu, lỗi (không khớp, trùng, sai, khoá, hết hạn, cần mạng), trạng thái đồng bộ, đăng xuất, khác tài khoản, "Khôi phục (admin)". Kiểm tra: `npx tsc --noEmit` và test hai từ điển cùng khoá
- [x] 6.2 Trang `/dang-ky/`: form 4 ô, kiểm tra tại chỗ, bước nhập mã 6 số (bàn phím số, tự gửi khi đủ 6 số), "Gửi lại mã" đếm ngược 60 giây, nhắc xem thư rác; xong thì đặt đánh dấu tài khoản, gắn sổ và về màn chính. Kiểm tra: e2e ở nhóm 7
- [x] 6.3 Trang `/dang-nhap/`: SĐT + mật khẩu, thông báo sai/khoá/chưa xác nhận (chuyển sang bước nhập mã), liên kết đăng ký và quên mật khẩu. Kiểm tra: e2e ở nhóm 7
- [x] 6.4 Trang `/quen-mat-khau/`: nhập SĐT → hiện email đã che → nhập mã + mật khẩu mới hai lần → về đăng nhập. Kiểm tra: e2e ở nhóm 7
- [x] 6.5 Menu: mục tài khoản theo trạng thái (chưa đăng nhập → link `/dang-nhap/`; đã đăng nhập → SĐT, trạng thái, lần đồng bộ gần nhất, "Đồng bộ ngay", "Đăng xuất"); hộp thoại đăng xuất giữ/xoá sổ kèm cảnh báo còn thay đổi chưa gửi; hộp thoại khác tài khoản; báo "cần đăng nhập lại". Kiểm tra: e2e ở nhóm 7
- [x] 6.6 Ba trang tài khoản báo cần mạng khi offline và không gửi request. Kiểm tra: e2e offline mở `/dang-nhap/` thấy thông báo, về màn chính vẫn ghi nợ được

## 7. E2E

- [x] 7.1 Playwright `webServer` chạy API (PGlite trong bộ nhớ, `E2E_TEST=1`) cùng `serve.mjs`; helper đọc mã OTP từ `/api/test/outbox`. Kiểm tra: e2e cũ vẫn qua hết
- [x] 7.2 E2E tài khoản: đăng ký → nhập mã → sổ có sẵn trên máy lên server; đăng nhập ở context thứ hai thấy cùng sổ; khoá sau 5 lần sai; quên mật khẩu thì máy cũ bị yêu cầu đăng nhập lại; đăng xuất giữ sổ / xoá sổ. Kiểm tra: tất cả qua
- [x] 7.3 E2E đồng bộ: hai context cùng tài khoản offline cùng ghi rồi online ra cùng số dư; ghi offline rồi có mạng tự lên server; đăng nhập tài khoản khác trên máy giữ sổ cũ thì bị hỏi và không trộn. Kiểm tra: tất cả qua
- [x] 7.4 Tổng: `npm test`, `npm run lint`, `npm run build` (≤ 180KB), `npm run test:e2e` đều qua

## 8. Triển khai

- [x] 8.1 Chạy migration lên nhánh Neon `main` (production) sau khi người dùng xác nhận — qua `npm run db:migrate:deploy` trong buildCommand của Vercel (chỉ chạy khi `VERCEL_ENV=production`). Kiểm tra: log build Production có dòng "Đã migrate … account, books, …" đủ bảng như trên `dev`
- [ ] 8.2 Push, Vercel deploy. Kiểm tra: `/api/health` trên `so-no-theta.vercel.app` trả OK, header `x-vercel-id` có `sin1`; đăng ký tài khoản thật nhận được mail OTP; hai điện thoại thấy cùng sổ
- [x] 8.3 Cập nhật `README.md`: biến môi trường, `dev:api`, `db:migrate`, cách chạy e2e, công cụ admin khôi phục, cách đổi nhà gửi mail. Kiểm tra: đọc lại khớp lệnh trong `package.json`
