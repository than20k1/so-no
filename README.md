# Sổ Nợ

Ứng dụng ghi nợ / trừ nợ cho người bán hàng ở chợ, tối ưu cho điện thoại. Bản 1 chạy hoàn toàn trên máy
(local-first, IndexedDB), không cần tài khoản, dùng được khi mất mạng. Tên "Sổ Nợ" là tên tạm.

Kế hoạch và yêu cầu chi tiết: `openspec/changes/ghi-no-ban-1/` (proposal, design, specs, tasks).

## Lệnh

```bash
npm install
npm run dev        # phát triển (không có service worker)
npm run build      # next build → sinh out/sw.js → kiểm tra ngân sách JS (≤180KB gzip)
npm run serve      # chạy thử bản build ở http://localhost:3100 (gzip, header giống Vercel)
npm test           # unit test (Vitest)
npm run test:e2e   # e2e (Playwright, màn 360x640) — cần `npm run build` trước
node scripts/measure.mjs   # đo thời gian mở app (cần `npm run serve` đang chạy)
node scripts/gen-icons.mjs # sinh lại biểu tượng PNG khi đổi logo
```

## Cấu trúc

```
app/                 các trang: / (màn chính), /ghi, /tru, /nguoi?id=
components/          giao diện (HomeScreen, DebtForm, DebtorDetail, Menu, Toast...)
lib/ledger/          lớp dữ liệu sổ nợ (Dexie): ghi/trừ/hủy, số dư, nhập hàng loạt, sao lưu
lib/i18n/            từ điển vi/en
scripts/             gen-sw (service worker), check-size, serve, measure, gen-icons
e2e/                 kịch bản Playwright
```

Giao diện chỉ gọi `lib/ledger` (không import Dexie trực tiếp) để bản 2 thêm đồng bộ mà không sửa màn hình.

## Hiệu năng (đo ngày 26/09/2026 trên bản build, máy dev)

Giả lập mạng Slow 4G (RTT 150ms, ~1,6Mbps) và CPU chậm 4 lần.

| Cách đo | Hai nút hiện & bấm được | App sẵn sàng (đã đọc sổ) |
|---|---|---|
| `scripts/measure.mjs` — lần mở đầu (trung vị 5 lần) | 0,23s | 1,45s |
| `scripts/measure.mjs` — lần mở sau (service worker) | 0,12s | 0,18s |
| Lighthouse 13.5 mobile, throttling devtools | FCP 1,3s | TTI 2,1s |
| Lighthouse 13.5 mobile, throttling mô phỏng | FCP 0,8s | TTI 2,5s |

- JS tải cho trang `/`: **175,7KB gzip** (ngân sách 180KB); trong đó Next.js + React ~130KB, Dexie ~31KB.
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
