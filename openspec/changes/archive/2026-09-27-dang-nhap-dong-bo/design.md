# Design

## Context

- App là trang tĩnh (`output: "export"`) deploy trên Vercel với `framework: null`, phục vụ thư mục `out/`. Chưa có code chạy phía server.
- Dữ liệu ở IndexedDB qua Dexie (schema version 2 sau change `sua-xoa-nguoi-no`): `books`, `debtors`, `transactions`, `debtorEvents`, `meta`. Mọi id là UUID tạo được khi offline; giao dịch và sự kiện chỉ ghi thêm; người nợ có `deletedAt`/`purgedAt`. Giao diện chỉ gọi `lib/ledger`.
- Service worker tự viết (`scripts/gen-sw.mjs`) bắt mọi request GET cùng origin, cache-first.
- Ngân sách JS màn chính 180KB, đang dùng 177,7KB.
- Neon Postgres 18 ở Singapore đã gắn vào project Vercel (`DATABASE_URL`, dạng sensitive, chỉ Production/Preview). Máy dev dùng nhánh Neon `dev` qua `.env.local`.
- Người dùng muốn chuyển server được về sau: tránh khoá vào dịch vụ đăng nhập của hãng, dữ liệu ở Postgres chuẩn.

## Goals / Non-Goals

**Goals:**
- Server nhỏ, chạy được ở Vercel lẫn bất kỳ máy Node nào mà không đổi code nghiệp vụ.
- App vẫn local-first: ghi nợ không bao giờ chờ mạng; đồng bộ chạy nền.
- Không mất dòng dữ liệu nào khi gộp, kể cả khi hai máy sửa lúc offline.
- Màn chính gần như không tăng JS.
- Test tự động chạy được không cần mạng (không cần Neon, không gửi mail thật).

**Non-Goals:**
- Nhiều người dùng chung một sổ, phân quyền (bản sau).
- OTP qua SMS (sau khi có tiền; chỉ cần thay chỗ gửi mã).
- Xoá tài khoản, đổi số điện thoại/email, trang admin trên web.
- Đồng bộ thời gian thực (push từ server); chỉ đồng bộ theo lượt.
- Mã hoá đầu cuối dữ liệu sổ.

## Decisions

### D1. Kiến trúc: trang tĩnh + một Vercel Function chạy Hono
```
 Trình duyệt (cùng origin)                  Vercel (sin1)                 Neon (Singapore)
 +----------------------+   /api/*   +---------------------------+   pg   +------------+
 | App tĩnh (out/)      | ---------> | api/index.ts        | -----> | Postgres   |
 | IndexedDB (Dexie)    |  cookie    |   -> server/app.ts (Hono)  |        |  (pooled)  |
 | lib/sync (tải lười)  | <--------- |   Better Auth, sync, mail  |        +------------+
 +----------------------+            +---------------------------+
```
- `server/app.ts` xuất một app Hono thuần (Web `Request`/`Response`). Điểm vào:
  - Vercel: `api/index.ts` dùng `hono/vercel`.
  - Node: `scripts/api-dev.mjs` dùng `@hono/node-server`, cho máy dev, e2e và VPS sau này.
- Cùng origin nên cookie phiên hoạt động mà không cần CORS.
- `vercel.json` thêm `"regions": ["sin1"]` để function nằm cạnh DB.
- `vercel.json` thêm rewrite `/api/(.*)` → `/api`, gom về một function `api/index.ts`. Lúc deploy thật phát hiện: `trailingSlash: true` thêm "/" cuối đường dẫn, làm route động `api/[...route].ts` không khớp (404). Hono đặt `strict: false` nên nhận cả đường dẫn có "/" cuối; client luôn gọi dạng có "/" cuối để khỏi bị chuyển hướng 308.
- *Phương án khác*:
  - Bỏ `output: "export"`, dùng Route Handlers của Next. Bỏ vì phải viết lại service worker/build, và gắn chặt server vào Next.
  - Supabase. Bỏ vì app gọi thẳng dịch vụ hãng và gói free tự tạm dừng khi không ai dùng.

### D2. Postgres qua `pg` + Drizzle; test bằng PGlite
- Production/dev: `drizzle-orm/node-postgres` với `Pool` trên chuỗi pooled của Neon (`max: 1` mỗi function instance). `pg` chạy với mọi Postgres, không phụ thuộc Neon.
- Schema khai báo ở `server/db/schema.ts`. Migration SQL sinh bằng `drizzle-kit generate` vào `server/db/migrations/` (commit vào git).
- Migration chạy bằng lệnh riêng `npm run db:migrate`, không tự chạy khi server khởi động.
- Unit/integration test và e2e dùng `@electric-sql/pglite` (Postgres chạy trong tiến trình) qua `drizzle-orm/pglite`, cùng migration. Chọn bằng `DATABASE_URL=pglite://memory`.

### D3. Better Auth làm lõi; app chỉ gọi API mỏng của mình
Better Auth (thư viện, lưu bảng `user/session/account/verification` trong chính DB, qua drizzle adapter) với:
- `emailAndPassword`: `minPasswordLength: 6`, `requireEmailVerification: true`.
- `emailOTP`: `overrideDefaultEmailVerification: true`, `sendVerificationOnSignUp: true`, `otpLength: 6`, `expiresIn: 600`, `allowedAttempts: 5`.
- `phoneNumber`: dùng số điện thoại làm định danh đăng nhập; `sendOTP` không dùng (chưa có SMS).
- Phiên: `expiresIn` 365 ngày, `updateAge` 1 ngày. Cookie `httpOnly`, `secure`, `sameSite=lax`.

Trình duyệt **không** dùng client của Better Auth: nó gọi các endpoint mỏng `/api/account/*` do mình viết, bọc `auth.api.*`.

| Endpoint | Việc |
|---|---|
| `POST register` | Chuẩn hoá SĐT, kiểm tra trùng SĐT/email, `signUpEmail` (name = SĐT) rồi gán `phoneNumber`; mail OTP kích hoạt được gửi |
| `POST verify` | `verifyEmailOTP`, tạo sổ server cho tài khoản, đặt cookie phiên |
| `POST resend` | Gửi lại OTP, tối đa 1 lần/60 giây mỗi email |
| `POST login` | Kiểm tra khoá (D4), chặn nếu email chưa xác nhận (trả `EMAIL_NOT_VERIFIED`, gửi lại mã), `signInPhoneNumber`, đếm sai/đúng |
| `POST forgot` | Tìm email theo SĐT, gửi OTP `forget-password`, trả email đã che. SĐT không tồn tại vẫn trả thành công giả (email che rỗng, không gửi) |
| `POST reset` | `resetPasswordEmailOTP`, thu hồi mọi phiên, xoá khoá |
| `POST logout` | Huỷ phiên hiện tại |
| `GET me` | `{ userId, phone, bookId }` hoặc 401 |

Lý do bọc lại:
- Cần logic Better Auth không có sẵn: khoá theo SĐT, tra email theo SĐT, không lộ tài khoản tồn tại.
- Thông báo lỗi thống nhất cho i18n.
- Không đưa client Better Auth vào bundle.
- Sau này đổi thư viện đăng nhập mà không đổi app.

Kết quả spike (task 2.3, Better Auth 1.7.6, giữ làm test `server/auth.spike.test.ts`):
- `signUpEmail` nhận `phoneNumber` ngay trong body và gửi OTP kích hoạt. Không cần bước gán riêng.
- `signInPhoneNumber` **không** tôn trọng `requireEmailVerification`. Vì vậy `login` phải tự kiểm tra `emailVerified` trước khi gọi.
- `resetPasswordEmailOTP` mặc định không thu hồi phiên cũ. Bật `emailAndPassword.revokeSessionsOnPasswordReset: true` thì mọi phiên bị xoá.
- `verifyEmailOTP` (với `autoSignInAfterVerification`) trả cookie phiên, nên đăng ký xong là đăng nhập luôn.

### D4. Khoá đăng nhập theo số điện thoại
- Bảng `login_throttle(phone pk, failures int, locked_until timestamptz)`. Sai → `failures+1`; đạt 5 → `locked_until = now + 15 phút`, `failures = 0`. Đúng → xoá dòng. Reset mật khẩu → xoá dòng.
- Kiểm tra khoá trước khi so mật khẩu. Đây là thêm vào rate limit mặc định theo IP của Better Auth, không thay thế nó.

### D5. Gửi mail: Gmail SMTP, thay được
- `server/mail.ts` có interface `sendMail({ to, subject, text })`. Production dùng `nodemailer` + Gmail SMTP (`GMAIL_USER`, `GMAIL_APP_PASSWORD` là App Password, cần bật xác minh 2 bước), giới hạn khoảng 500 mail/ngày.
- Khi `E2E_TEST=1`: mail đưa vào hộp thư trong bộ nhớ, đọc qua `GET /api/test/outbox?to=` (chỉ tồn tại khi biến này bật).
- Sau này thay bằng Resend hoặc SMS OTP chỉ cần đổi implementation này.

### D6. Bảng sổ nợ trên server
Ánh xạ 1-1 với dữ liệu trình duyệt, thêm cột quản lý:
```
books(id uuid pk, owner_user_id text unique, name, created_at)
debtors(id uuid pk, book_id fk, name, note, search_key, created_at, updated_at,
        deleted_at, purged_at, server_deleted_at, seq bigint)
transactions(id uuid pk, book_id fk, debtor_id, amount bigint, kind, direction, occurred_at,
             created_at, updated_at, voided_at, source, note, device_id, seq bigint)
debtor_events(id uuid pk, book_id fk, debtor_id, kind, before jsonb, after jsonb, at, device_id, seq bigint)
index (book_id, seq) trên cả ba bảng; sequence chung sync_seq
```
- Mỗi lần server ghi hoặc đổi một dòng, `seq = nextval('sync_seq')`. `seq` là con trỏ đồng bộ theo thứ tự server, không phụ thuộc đồng hồ máy.
- Số dư **không** lưu trên server: mỗi máy tự tính lại từ giao dịch.
- Thời gian lưu dạng epoch ms (`bigint`) giống trình duyệt, để không lệch khi đổi qua lại.

### D7. Giao thức: một request vừa đẩy vừa kéo
`POST /api/sync`:
```
body:     { cursor: number, push: { debtors[], transactions[], debtorEvents[] } }   // tối đa 500 dòng
response: { cursor, pull: { debtors[], transactions[], debtorEvents[] }, hasMore,
            rejected: [{ table, id, reason }], serverNow }
```
Server làm trong một transaction DB:
1. **Gán sổ**: mọi dòng đẩy lên bị gán `book_id` = sổ của tài khoản, bỏ qua `bookId` máy gửi. Dòng trùng id nhưng thuộc sổ khác bị từ chối (`reason: "foreign"`).
2. **Gộp**:
   - Giao dịch và sự kiện: `insert … on conflict do nothing`.
   - Giao dịch đã có: `voided_at = coalesce(cũ, mới)` (đã hủy thì không bao giờ bỏ hủy).
   - Người nợ: tên, ghi chú, `deleted_at` lấy theo bản đẩy lên sau cùng (thứ tự tới server).
     - `deleted_at` từ null thành có: `server_deleted_at = now()`.
     - Khôi phục: `server_deleted_at = null`.
     - `purged_at` từ máy: chỉ nhận khi `now() - server_deleted_at >= 15 ngày`, nếu không thì `rejected: "purge_too_early"`. Máy không bao giờ bỏ được `purged_at`; chỉ admin làm được.
   - Dòng nào thực sự thay đổi thì được cấp `seq` mới.
3. **Tự xoá hẳn**: người nợ của sổ có `server_deleted_at <= now() - 30 ngày` và chưa `purged_at` → `purged_at = now()`, cấp `seq` mới.
4. **Kéo**: trả các dòng của sổ có `seq > cursor`, sắp theo `seq`, tối đa 1000 dòng; `hasMore` nếu còn. Kể cả dòng máy vừa đẩy: máy ghi đè bằng bản của server, nhờ đó nhận luôn kết quả gộp.

Validate mọi dòng: UUID, số tiền nguyên dương ≤ 1 tỷ, `kind` hợp lệ, chuỗi ≤ 200 ký tự. Body giới hạn 1MB.

### D8. Trình duyệt: đánh dấu dòng cần đẩy bằng hook Dexie
- Dexie version 3 thêm chỉ mục `_dirty` cho `debtors`, `transactions`, `debtorEvents`. Hook `creating`/`updating` gán `_dirty = 1`, trừ khi chính bản sửa có chứa `_dirty` (dòng kéo về từ server được ghi với `_dirty: 0`).
- Upgrade version 3 đánh dấu mọi dòng cũ `_dirty = 1`, để lần đăng nhập đầu đẩy cả sổ.
- Bỏ đánh dấu an toàn: sau khi đẩy thành công, trong một transaction rw, chỉ đặt `_dirty = 0` cho dòng mà `updatedAt`/`voidedAt`/`deletedAt`/`purgedAt` còn giống lúc gửi. Dòng bị sửa trong lúc request đang chạy vẫn giữ `_dirty` và được đẩy ở lượt sau.
- Áp dữ liệu kéo về: dòng máy đang `_dirty` thì giữ bản máy (nó sẽ được đẩy và server trả lại kết quả gộp ở lượt sau); các dòng khác ghi bản server. Sau đó `recomputeBalance` cho mọi người nợ bị chạm.
- Máy chưa đăng nhập vẫn chạy hook (dòng cứ `_dirty`). Chi phí không đáng kể, và đúng là thứ cần đẩy khi đăng nhập.

### D9. Sổ nào trên máy thuộc tài khoản nào
`meta.accountUserId` ghi tài khoản mà sổ trên máy đang thuộc về. Khi đăng nhập xong (`me` trả `bookId`):
- Chưa có `accountUserId` (máy chưa từng đăng nhập): đổi `bookId` của mọi dòng trên máy sang sổ của tài khoản trong một transaction, rồi đặt `currentBookId`/`accountUserId`. Id là UUID nên gộp không bao giờ trùng.
- Trùng `userId`: dùng tiếp.
- Khác `userId`: hỏi "Xoá sổ trên máy để dùng sổ của tài khoản này" hoặc "Huỷ" (huỷ thì gọi `logout`). Không bao giờ gộp chéo.
- Đăng xuất giữ sổ: giữ `accountUserId`. Đăng xuất xoá sổ: xoá DB rồi tạo sổ trống mới.

### D10. Giờ server cho thùng rác
- Mỗi lượt đồng bộ lưu `meta.serverOffset = serverNow - Date.now()`. Khi đã đăng nhập, `trashState` và `purgeExpired` dùng `Date.now() + serverOffset`.
- Server vẫn là trọng tài (D7). Nếu server từ chối `purge_too_early`, máy đặt lại `purgedAt = null` cho dòng đó.

### D11. Giữ màn chính nhẹ
- Đánh dấu đăng nhập: `localStorage["so-no.account"]` = `{ phone }` (không phải bí mật; phiên thật nằm trong cookie httpOnly).
- `Providers` chỉ làm: nếu có đánh dấu → `requestIdleCallback(() => import("@/lib/sync").then(s => s.start()))`. Toàn bộ bộ đồng bộ, hook trạng thái và UI tài khoản nằm ở chunk tải lười, trang riêng, hoặc trong Menu (vốn đã tải lười).
- Hook `_dirty` ở `db.ts` chỉ vài dòng.
- Mục tiêu: màn chính tăng dưới 1KB. `check-size` vẫn chặn ở 180KB.
- Kích hoạt đồng bộ: khi `start()`, sau thay đổi Dexie (`Dexie.on("storagemutated")`, debounce 2 giây), sự kiện `online`, `visibilitychange` sang hiện, và mỗi 60 giây khi trang đang hiện. Chỉ một lượt chạy tại một thời điểm.
- Lỗi mạng: thử lại với backoff (5 giây, 15 giây, 60 giây). Lỗi 401: đặt trạng thái "cần đăng nhập lại", dừng.

### D12. Service worker không đụng `/api`
`gen-sw.mjs` bỏ qua mọi request có path bắt đầu `/api/`, để request tài khoản/đồng bộ luôn tới mạng và không bao giờ trả từ cache.

### D13. Công cụ admin khôi phục
- `scripts/admin-restore.mjs --phone 0912345678 --name "Anh Tú" [--apply]`: mặc định chỉ liệt kê kết quả khớp (chạy thử); có `--apply` mới ghi.
- Khi ghi: đặt `deleted_at`, `purged_at`, `server_deleted_at` = null, cấp `seq` mới, thêm sự kiện `restore` với `device_id = "admin"`. Màn lịch sử sửa hiển thị "Khôi phục (admin)".
- Chạy trên máy admin với `DATABASE_URL` production lấy từ Neon console, không lưu vào file.

### D14. Chạy local và e2e
- `npm run dev:api`: server Node trên cổng 3101, dùng `.env.local` (nhánh Neon `dev`) hoặc `DATABASE_URL=pglite://memory`.
- `scripts/serve.mjs` chuyển `/api/*` tới `API_URL` (mặc định `http://localhost:3101`).
- Playwright `webServer` khởi động cả hai; API chạy PGlite trong bộ nhớ với `E2E_TEST=1`.
- `next dev` vẫn dùng được cho việc làm giao diện, nhưng không có `/api`. Test luồng tài khoản thì dùng bản build + `serve`.

### D15. Bảo mật
- Chống CSRF:
  - Better Auth kiểm tra `Origin` với `BETTER_AUTH_URL`/`trustedOrigins`.
  - Endpoint của mình chỉ nhận `application/json` và kiểm tra `Origin` cùng miền.
- Rate limit của Better Auth bật, lưu trong DB (function không có bộ nhớ chung).
- Log không ghi số điện thoại, email, mã OTP hay nội dung sổ.
- `BETTER_AUTH_SECRET` sinh ngẫu nhiên 32 byte, chỉ nằm trong biến môi trường.

## Risks / Trade-offs

- [Plugin Better Auth không khớp đúng luồng SĐT + mật khẩu + OTP email] → Spike ở task 2.3 trước mọi việc khác. Dự phòng: endpoint `/api/account/*` tự kiểm tra, chỉ dùng Better Auth cho băm mật khẩu, phiên và OTP.
- [Neon free ngủ, lượt đầu chậm khoảng 0,5–1 giây] → Đồng bộ chạy nền nên người dùng không thấy; màn đăng nhập hiện trạng thái đang xử lý.
- [Gmail SMTP vào thư rác hoặc vượt khoảng 500 mail/ngày] → Email ghi rõ tên app; màn nhập mã nhắc kiểm tra thư rác. Khi đông người thì đổi nhà gửi (D5).
- [Vercel Hobby không cho dùng thương mại] → Khi bắt đầu thu tiền thì lên Pro hoặc chuyển server (D1 đã tách sẵn).
- [Nhiều function instance mở nhiều kết nối DB] → Chuỗi pooled (PgBouncer) của Neon, `max: 1` mỗi instance.
- ["Bản tới sau cùng thắng" có thể ghi đè một lần đổi tên] → Lịch sử sửa giữ mọi lần đổi nên sửa lại được; dữ liệu tiền (giao dịch) không bao giờ bị ghi đè.
- [Sổ lớn lần đầu đẩy lên lâu] → Chia lô 500 dòng mỗi request, lặp đến hết; app vẫn dùng bình thường trong lúc đó.
- [Ngân sách JS màn chính chỉ còn khoảng 2KB] → D11. `check-size` chặn build nếu vượt.
- [Lộ dữ liệu cá nhân] → Mỗi truy vấn đều lọc theo sổ của phiên (D7.1); DB chỉ truy cập qua chuỗi kết nối bí mật; không log PII.

## Migration Plan

1. Archive change `sua-xoa-nguoi-no` để main spec có `debtor-management` và menu có Thùng rác.
2. Tạo biến môi trường trên Vercel (Production + Preview): `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (`https://so-no-theta.vercel.app`), `GMAIL_USER`, `GMAIL_APP_PASSWORD`. Thêm các biến tương ứng vào `.env.local` (với `BETTER_AUTH_URL=http://localhost:3100`).
3. `npm run db:migrate` trên nhánh Neon `dev`, chạy thử toàn bộ. Production: Vercel tự chạy `npm run db:migrate:deploy` trước `npm run build` mỗi lần deploy Production (có sẵn `DATABASE_URL` lúc build, migration chỉ áp phần còn thiếu). Preview bỏ qua, để không ai phải chép chuỗi kết nối production ra máy.
4. Deploy. Kiểm tra `/api/health` trả OK từ vùng `sin1` (header `x-vercel-id`), đăng ký một tài khoản thật với email thật, thử 2 điện thoại.
5. Quay lui:
   - API chỉ thêm mới, không đổi hành vi offline. Nếu lỗi, deploy lại commit trước là app trở về bản không đăng nhập; dữ liệu trên máy không mất.
   - Dexie version 3 không quay về được (như version 2) nên chỉ sửa tiến.
   - Bảng server để nguyên.

## Open Questions

- Địa chỉ Gmail dùng để gửi mã (nên là một Gmail riêng cho app, ví dụ `sono.app.otp@gmail.com`). Cần trước task 1.3; không đổi thiết kế.
