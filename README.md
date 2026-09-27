# Sổ Nợ

Ứng dụng ghi nợ / trừ nợ cho người bán hàng ở chợ, tối ưu cho điện thoại. Sổ nằm trên máy (local-first, IndexedDB),
dùng được khi mất mạng, không bắt buộc tài khoản. Đăng nhập (số điện thoại + mật khẩu) thì sổ được đồng bộ lên server
và giữa các máy. Tên "Sổ Nợ" là tên tạm.

Yêu cầu hiện hành của app: `openspec/specs/` (mỗi thư mục một phần: ghi nợ, sổ nợ, người nợ, sao lưu...).
Các thay đổi đang làm nằm ở `openspec/changes/`, thay đổi đã xong ở `openspec/changes/archive/`.

## Lệnh

```bash
npm install
npm run dev        # phát triển giao diện (không có service worker, không có /api)
npm run build      # next build → sinh out/sw.js → kiểm tra ngân sách JS (≤180KB gzip)
npm run dev:api    # server API ở cổng 3101 (đọc .env.local; DATABASE_URL=pglite://memory để chạy không cần Neon)
npm run serve      # chạy thử bản build ở http://localhost:3100, /api được chuyển tới cổng 3101
npm test           # unit test + test tích hợp server (Vitest, Postgres trong bộ nhớ bằng PGlite)
npm run test:e2e   # e2e (Playwright, màn 360x640) — cần `npm run build` trước; tự chạy API PGlite + hộp thư giả
npm run db:generate  # sinh migration SQL sau khi sửa server/db/schema.ts
npm run db:migrate   # chạy migration lên DATABASE_URL (mặc định .env.local = nhánh Neon `dev`)
node scripts/measure.mjs   # đo thời gian mở app (cần `npm run serve` đang chạy)
node scripts/gen-icons.mjs # sinh lại biểu tượng PNG (kể cả bản maskable) từ scripts/icon.svg
```

## Cấu trúc

```
app/                 các trang: / (màn chính), /ghi, /tru, /nguoi?id=, /thung-rac
components/          giao diện (HomeScreen, DebtForm, DebtorDetail, DebtorEditSheet, TrashScreen, Menu, Toast...)
lib/ledger/          lớp dữ liệu sổ nợ (Dexie): ghi/trừ/hủy, số dư, nhập hàng loạt, sao lưu,
                     sửa/xoá người nợ + lịch sử sửa + thùng rác (debtors.ts)
lib/sync/            đồng bộ phía trình duyệt (tải lười): engine đẩy/kéo, gắn sổ với tài khoản, gọi API tài khoản
server/              server API (Hono): account.ts (đăng ký/đăng nhập/OTP), sync.ts, auth.ts (Better Auth),
                     mail.ts, admin.ts, db/ (schema Drizzle + migrations)
api/index.ts    điểm vào Vercel Function cho mọi /api/*
scripts/icon.svg     biểu tượng gốc của app (cuốn sổ + dấu "NỢ")
lib/i18n/            từ điển vi/en
scripts/             gen-sw (service worker), check-size, serve, measure, gen-icons
e2e/                 kịch bản Playwright
```

Giao diện chỉ gọi `lib/ledger` (không import Dexie trực tiếp) để bản 2 thêm đồng bộ mà không sửa màn hình.

## Xoá người nợ

Xoá = cho vào Thùng rác (menu → Thùng rác). 15 ngày đầu chỉ khôi phục được; từ ngày 15 được bấm "Xoá hẳn";
đủ 30 ngày app tự xoá hẳn khi mở. "Xoá hẳn" chỉ ẩn vĩnh viễn: người nợ, giao dịch và lịch sử sửa vẫn nằm trong
IndexedDB và trong file sao lưu (định dạng version 2), để khôi phục được khi cần.
Mọi lần sửa/xoá/khôi phục đều ghi một dòng vào lịch sử sửa (bảng `debtorEvents`, chỉ ghi thêm).

## Hiệu năng (đo ngày 26/09/2026 trên bản build, máy dev)

Giả lập mạng Slow 4G (RTT 150ms, ~1,6Mbps) và CPU chậm 4 lần.

| Cách đo | Hai nút hiện & bấm được | App sẵn sàng (đã đọc sổ) |
|---|---|---|
| `scripts/measure.mjs` — lần mở đầu (trung vị 5 lần) | 0,23s | 1,45s |
| `scripts/measure.mjs` — lần mở sau (service worker) | 0,12s | 0,18s |
| Lighthouse 13.5 mobile, throttling devtools | FCP 1,3s | TTI 2,1s |
| Lighthouse 13.5 mobile, throttling mô phỏng | FCP 0,8s | TTI 2,5s |

- JS tải cho trang `/`: **178,3KB gzip** (ngân sách 180KB); trong đó Next.js + React ~130KB, Dexie ~31KB.
- Lighthouse: Performance 97–98, Accessibility 100, Best Practices 100.
- Hai nút là link thường nên bấm được ngay khi hiện, trước cả khi JavaScript chạy xong.
- Hai số Lighthouse ở lần mở đầu cao hơn mục tiêu 2s vì Lighthouse cộng thêm độ trễ mỗi request (~560ms).
  Các lần mở sau luôn lấy từ cache của service worker, nên gần như tức thì.

## Deploy (Vercel)

Dự án xuất tĩnh (`output: "export"`). `vercel.json` chốt cách build: chạy `npm run build` và phục vụ nguyên thư mục `out/`
(không dùng preset Next.js, để chắc chắn `sw.js` sinh sau `next build` được deploy kèm).
`vercel.json` đặt `Cache-Control: no-cache` cho `/sw.js` và `/manifest.webmanifest` để người dùng luôn nhận bản mới.
Sau khi deploy, kiểm tra: `curl -I https://<tên-app>.vercel.app/sw.js` phải thấy `cache-control: no-cache`.

Service worker mới được cài ngầm và chỉ có hiệu lực ở lần mở app sau, nên không bao giờ tải lại trang khi người dùng đang nhập.

## Tài khoản và đồng bộ

- Server: app Hono (`server/app.ts`) chạy trên Vercel vùng `sin1`, lưu Postgres (Neon, Singapore), đăng nhập bằng thư viện
  Better Auth lưu trong chính DB đó. Muốn chuyển server: chạy `scripts/api-dev.ts` (Node) ở máy mới + `pg_dump`/`pg_restore`.
- Đăng ký: SĐT + email + mật khẩu → mã OTP 6 số qua email. Đăng nhập: SĐT + mật khẩu (sai 5 lần khoá 15 phút).
  Quên mật khẩu: OTP qua email.
- Đồng bộ: `POST /api/sync` vừa đẩy vừa kéo theo con trỏ `seq`. Giao dịch và lịch sử sửa chỉ ghi thêm; người nợ theo bản
  tới server sau cùng; mốc thùng rác 15/30 ngày tính theo giờ server.

### Biến môi trường

| Biến | Ở đâu | Ghi chú |
|---|---|---|
| `DATABASE_URL` | Vercel (tự có từ Neon) và `.env.local` | máy dev dùng nhánh Neon `dev` |
| `BETTER_AUTH_SECRET` | Vercel + `.env.local` | `openssl rand -base64 32`, mỗi môi trường một giá trị |
| `BETTER_AUTH_URL` | Vercel + `.env.local` | `https://so-no-theta.vercel.app` / `http://localhost:3100` |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Vercel (+ `.env.local` nếu muốn gửi thật) | App Password của Gmail (bật xác minh 2 bước). Không có thì máy dev in mã OTP ra terminal |

Đổi nhà gửi mail (Resend, SMS OTP...): viết một `Mailer` mới trong `server/mail.ts` và chọn nó trong `mailerFromEnv`.

### Khôi phục người nợ cho khách (admin)

```bash
# Chạy thử (chỉ liệt kê). Lấy chuỗi production từ Neon console, dán trực tiếp, không lưu vào file.
DATABASE_URL="postgresql://..." npm run admin:restore -- --phone 0912345678 --name "Anh Tú"
# Khôi phục thật
DATABASE_URL="postgresql://..." npm run admin:restore -- --phone 0912345678 --name "Anh Tú" --apply
```
Máy của khách thấy lại người đó ở lần đồng bộ sau; lịch sử sửa ghi "Khôi phục (admin)".
