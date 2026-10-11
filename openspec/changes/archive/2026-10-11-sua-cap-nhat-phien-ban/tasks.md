# Tasks

## 1. Service worker

- [x] 1.1 Trong `scripts/gen-sw.mjs`, thêm handler `message`: `SKIP_WAITING` → `self.skipWaiting()`, `GET_VERSION` → trả `VERSION` qua `event.ports[0]`; kiểm tra bằng `npm run build` rồi đọc `out/sw.js` thấy cả hai handler
- [x] 1.2 Navigation bị cache miss thì gọi `self.registration.update()` (không chặn response) trước khi lấy mạng (design D5); kiểm tra bằng build + đọc `out/sw.js`

## 2. Điều phối cập nhật phía trang

- [x] 2.1 Tạo `lib/update.ts`: store `{ waiting, safe, version }`, `checkForUpdate()`, `applyUpdate()` (gửi `SKIP_WAITING`, reload một lần theo `controllerchange` với cờ chống lặp theo VERSION); unit test Vitest giả lập `navigator.serviceWorker` cho: có waiting lúc đăng ký, `updatefound` → `installed`, không reload hai lần
- [x] 2.2 `components/Providers.tsx` dùng `lib/update.ts`: đăng ký SW, kiểm tra khi mở app và khi `visibilitychange` → visible (tối đa 1 lần/60 giây), tự áp dụng khi `waiting && safe` ngay lúc mở/quay lại; cập nhật `components/providers.test.tsx` cho các nhánh này
- [x] 2.3 Hook `useSafeToUpdate(safe: boolean)`; gắn vào `HomeScreen` (safe khi menu và sheet đóng) và `GroupsScreen` (safe khi form tạo nhóm đóng); kiểm tra bằng test component: mở form tạo nhóm → store `safe = false`

## 3. Giao diện

- [x] 3.1 Thành phần `UpdateBar` ("Có bản mới — Cập nhật") hiển thị khi `waiting` và chưa tự áp dụng, không che nút Lưu của form; thêm chuỗi vi/en; test component: hiện khi waiting, bấm gọi `applyUpdate`
- [x] 3.2 Trong `components/Menu.tsx`, thêm dòng mã phiên bản và nút "Kiểm tra bản mới" với ba kết quả (đang mới nhất / có bản mới → hiện UpdateBar / cần mạng); test component cho cả ba nhánh

## 4. Kiểm thử đầu-cuối

- [x] 4.1 E2E Playwright: build hai bản khác nhau phục vụ cùng origin (theo cách đã dùng khi điều tra: server đổi thư mục `out` theo cờ), mở bản A ở màn chính, chuyển sang bản B, quay lại app (visibilitychange) → trang tự chạy bản B; reload 3 lần vẫn là bản B
- [x] 4.2 E2E: đang ở `/ghi/` nhập số tiền khi bản mới sẵn sàng → không reload, số tiền còn nguyên, UpdateBar hiện; bấm Cập nhật → chạy bản mới
- [x] 4.3 E2E: từ `/chia-tien/` bấm tab "Ghi nợ" sau khi deploy bản mới → màn Ghi nợ vẫn có công tắc chế độ (không rơi về bản cũ)
- [x] 4.4 Chạy `npm test`, `npm run lint`, `npm run build` (gồm kiểm tra dung lượng) đều qua

## 5. Xác nhận lỗi treo trên Android

- [ ] 5.1 Sau khi deploy, nhờ người dùng đóng hẳn app một lần, mở lại, kiểm tra mã phiên bản trong menu khớp bản vừa deploy
- [ ] 5.2 Người dùng thử lại luồng: đăng nhập → Ghi nợ → lưu, nhiều lần. Nếu còn treo "đang tải": gỡ lỗi trực tiếp qua `chrome://inspect` (console, IndexedDB, network), ghi nguyên nhân và mở change riêng nếu khác gốc
