# Proposal

## Why

Sổ nợ hiện chỉ nằm trong trình duyệt của một máy: mất máy, đổi máy hay trình duyệt xoá dữ liệu là mất sổ, và file sao lưu phụ thuộc người dùng nhớ xuất. Người bán cần một tài khoản để sổ được giữ trên server, tự đồng bộ giữa các máy, và để "xoá hẳn" thực sự khôi phục được bởi admin. Database Neon (Singapore) đã được tạo và gắn vào project Vercel, nên giờ là lúc làm phần server.

## What Changes

- **Đăng ký**: số điện thoại + email + mật khẩu + nhập lại mật khẩu → nhận mã OTP qua email → nhập mã để kích hoạt tài khoản.
- **Đăng nhập**: số điện thoại + mật khẩu. Sai 5 lần liên tiếp thì khoá đăng nhập số đó 15 phút. Phiên đăng nhập dài (không bắt đăng nhập lại mỗi ngày).
- **Quên mật khẩu**: nhập số điện thoại → mã OTP gửi về email đã đăng ký → đặt mật khẩu mới.
- **Đăng xuất**: hỏi giữ hay xoá sổ trên máy (mặc định giữ).
- **Đồng bộ**: app vẫn ghi/trừ nợ tức thì trên máy (kể cả offline); khi đã đăng nhập và có mạng thì tự đẩy lên server và kéo thay đổi từ máy khác về. Lần đăng nhập đầu đưa sổ sẵn có trên máy lên tài khoản; máy thứ hai cũng có sổ thì gộp, không mất dòng nào.
- **Menu**: mục "Đăng nhập / Đồng bộ" hoạt động thật: chưa đăng nhập → mở màn đăng nhập; đã đăng nhập → hiện số điện thoại, lần đồng bộ gần nhất, nút "Đồng bộ ngay", "Đăng xuất".
- **Mốc 15/30 ngày theo giờ server** khi đã đăng nhập, để không lách được bằng cách chỉnh giờ máy.
- **Công cụ admin**: script khôi phục người nợ đã xoá hẳn của một tài khoản.
- **Server**: API riêng (Hono) chạy trên Vercel vùng Singapore, lưu trong Postgres (Neon), đăng nhập bằng thư viện Better Auth lưu trong chính DB đó; gửi email OTP qua Gmail SMTP. Không phụ thuộc dịch vụ đăng nhập của hãng nào, để sau này chuyển server chỉ cần mang code + `pg_dump`.

## Capabilities

### New Capabilities
- `user-account`: đăng ký có xác nhận OTP email, đăng nhập bằng số điện thoại + mật khẩu, khoá khi sai nhiều lần, quên mật khẩu, đăng xuất, phiên đăng nhập.
- `cloud-sync`: đưa sổ lên tài khoản, đồng bộ hai chiều nhiều máy, quy tắc gộp, đồng bộ khi có mạng lại, trạng thái đồng bộ, chặn trộn sổ của hai tài khoản, mốc 15/30 ngày theo giờ server, khôi phục bởi admin.

### Modified Capabilities
- `app-settings`: mục "Đăng nhập / Đồng bộ" trong menu hoạt động thật thay cho trạng thái "sắp có".
- `offline-app-shell`: làm rõ chức năng nào cần mạng (đăng ký, đăng nhập, quên mật khẩu) và đồng bộ tự chạy lại khi có mạng; ngân sách JS màn chính giữ nguyên.

Hai capability trên cũng đang được change `sua-xoa-nguoi-no` sửa (thêm mục Thùng rác, chức năng thùng rác chạy offline). Delta ở change này đã bao gồm nội dung đó; **phải archive `sua-xoa-nguoi-no` trước** change này.

## Impact

- **Mới**: thư mục `server/` (app Hono, cấu hình Better Auth, schema Drizzle, logic đồng bộ, gửi mail), `api/index.ts` (điểm vào Vercel Function), `lib/sync/` (bộ đồng bộ phía trình duyệt, tải lười), các trang `app/dang-nhap/`, `app/dang-ky/`, `app/quen-mat-khau/`, `scripts/admin-restore.mjs`, migration SQL.
- **Sửa**: `lib/ledger/db.ts` (Dexie version 3: đánh dấu dòng cần đẩy), `components/Menu.tsx`, `components/Providers.tsx`, `scripts/gen-sw.mjs` (không chặn `/api`), `scripts/serve.mjs` (chuyển `/api` sang server local), `vercel.json` (vùng `sin1`), `package.json`.
- **Thư viện mới (chỉ phía server/test, không vào bundle màn chính)**: `hono`, `better-auth`, `drizzle-orm`, `pg`, `nodemailer`; dev: `drizzle-kit`, `@electric-sql/pglite`, `@hono/node-server`.
- **Biến môi trường**: `DATABASE_URL` (đã có), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`.
- **Ngân sách JS màn chính 180KB** (đang 177,7KB): mọi phần đăng nhập/đồng bộ phải tải lười; màn chính chỉ thêm vài trăm byte.
- **Dữ liệu cá nhân**: tên người nợ, số tiền, số điện thoại, email được lưu trên server của bạn (Neon, Singapore).
