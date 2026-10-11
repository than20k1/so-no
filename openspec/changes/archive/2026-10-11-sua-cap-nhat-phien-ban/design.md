# Design

## Context

- `scripts/gen-sw.mjs` sinh `out/sw.js`: precache toàn bộ `out/`, phục vụ cache-first (kể cả navigation), gặp cache miss thì lấy mạng. Cố ý không `skipWaiting` để bản mới "áp dụng ở lần mở sau".
- `components/Providers.tsx` chỉ `register("/sw.js")`, không lắng nghe gì thêm.
- Hệ quả đã tái hiện (build `2ef9c54` → `HEAD` cùng origin, Chromium giả lập Pixel 7):
  - SW mới nằm `waiting` qua mọi lần reload; chỉ đóng hết tab mới lên bản mới.
  - Route chỉ có ở bản mới (`/chia-tien/`) bị cache miss → HTML + chunk bản mới lấy từ mạng, chạy dưới SW cũ; bấm tab "Ghi nợ" → `/` trả từ cache cũ → rơi về bản cũ. Một phiên chạy lẫn hai bản, cùng ghi IndexedDB (DB v3 ↔ v4) và cùng chạy đồng bộ.
- Trên Chromium giả lập chưa tái hiện được lỗi treo "đang tải" ở Android; giả thuyết là nó sinh ra từ việc trộn hai bản ở trên.

## Goals / Non-Goals

**Goals:**
- Bản mới được áp dụng trong vòng một lần mở/quay lại app, không cần đóng hẳn app.
- Một phiên chỉ chạy một bản.
- Có cách nhìn thấy máy đang chạy bản nào để hỗ trợ từ xa.

**Non-Goals:**
- Không đổi chiến lược cache-first cho app shell (giữ mở tức thì và offline).
- Không làm cơ chế cập nhật dữ liệu/migration DB mới — Dexie đã tự xử lý versionchange.

## Decisions

### D1. SW nhận lệnh `SKIP_WAITING` từ trang, không tự `skipWaiting`
SW thêm `message` handler: `{type: "SKIP_WAITING"}` → `self.skipWaiting()`. Trang quyết định khi nào gửi. Khi `navigator.serviceWorker` phát `controllerchange` → `location.reload()` đúng một lần (cờ chống lặp).
- *Thay thế*: `skipWaiting()` trong `install` → đơn giản nhưng tải lại giữa lúc đang nhập (vi phạm spec) hoặc để trang cũ chạy dưới SW mới (chunk cũ đã bị xoá khỏi cache → lỗi tải chunk). Loại.

### D2. Chủ động kiểm tra bản mới
Trang gọi `registration.update()` khi mở app và mỗi lần `visibilitychange` → `visible` (giới hạn tối đa 1 lần/60 giây). Theo dõi `updatefound` / `installing.statechange` để biết khi nào có `waiting`. Cũng kiểm tra `registration.waiting` ngay khi đăng ký (bản mới đã tải từ lần trước).

### D3. "Màn an toàn" do từng màn khai báo, không đoán theo URL
Một store nhỏ (module `lib/update.ts`, không phụ thuộc React) giữ trạng thái `{ waiting: boolean, safe: boolean }`. Màn chính Ghi nợ và danh sách Chia tiền đặt `safe = true` khi không có form/hộp thoại mở (vd. form tạo nhóm, sheet sửa người nợ, menu đang mở → `safe = false`); mọi màn khác mặc định `false`.
Tự áp dụng chỉ khi: `waiting && safe && (vừa mở app || vừa quay lại từ nền || vừa vào một màn chính) && chưa chạm gì từ lúc đó && không có toast đang hiện`. Không tự áp dụng khi đang ở giữa phiên dù `safe` — tránh trang tự nháy khi người dùng đang đọc danh sách.
- "Vừa vào một màn chính" được thêm khi làm: nếu không, người dùng chạm vào màn trước khi bản mới cài xong rồi chuyển tab Ghi nợ ↔ Chia tiền sẽ vẫn chạy lẫn hai bản tới khi bấm Cập nhật (trái spec).
- Toast (thường kèm "Hoàn tác" ngay sau khi lưu) tạm giữ việc tự tải lại, để tải lại không làm mất nút Hoàn tác; toast đóng mà vẫn đủ điều kiện thì áp dụng ngay.
- *Thay thế*: đoán theo pathname (`/`, `/chia-tien/`) → không biết form tạo nhóm đang mở trên `/chia-tien/`. Loại.

### D4. Thanh "Có bản mới — Cập nhật"
Hiện khi `waiting` và không tự áp dụng. Đặt ở dưới cùng màn hình (trên safe-area), không che nút Lưu của form: trên các màn form hiện dạng dòng mỏng phía trên header. Bấm → gửi `SKIP_WAITING` (D1). Không có nút đóng vĩnh viễn; ẩn tạm được trong phiên.

### D5. Chặn trộn bản trong SW
Nhờ D1–D3, cửa sổ thời gian SW cũ còn điều khiển trang ngắn lại, nhưng vẫn cần chặn trộn:
- Với navigation bị **cache miss** (route SW hiện tại không biết), SW gọi `self.registration.update()` rồi vẫn trả từ mạng như cũ (không vỡ offline). Trang mới tải về sẽ thấy `waiting` và hiện/áp dụng cập nhật theo D3–D4.
- Tab khác bật bản mới (sự kiện `controllerchange` mà tab này không yêu cầu): tab này đang chạy bản cũ dưới SW mới → đánh dấu `stale`. Nếu đang ở màn an toàn ngay lúc mở/quay lại → tải lại; nếu không → hiện thanh Cập nhật, bấm là tải lại. (Không so mã bản nhúng trong trang: `VERSION` chỉ được tính sau `next build`, trang không biết được.)
- *Thay thế*: network-first cho navigation → chậm khi mạng chợ yếu, vi phạm "Tải nhanh". Loại.

### D6. Phiên bản trong menu
`gen-sw.mjs` đã tính `VERSION` (hash 12 ký tự). Trang hỏi SW `GET_VERSION` để hiện; không có SW (dev) thì hiện "dev". Nút "Kiểm tra bản mới" gọi `registration.update()` và chờ kết quả (có `installing` → chờ tới `installed`; không → "Đang dùng bản mới nhất"; lỗi mạng → "Cần kết nối").

## Risks / Trade-offs

- [Vòng tải lại vô hạn nếu `controllerchange` bắn lặp] → cờ trong bộ nhớ: mỗi trang chỉ tải lại vì cập nhật một lần; sau khi tải lại trang đã do SW mới điều khiển nên không còn `waiting`.
- [Lần cài đầu cũng bắn `controllerchange` (do `clients.claim()`)] → bỏ qua khi trang lúc mở chưa có SW điều khiển và chưa có bản chờ.
- [Lỗi treo Android không do trộn bản] → sau khi deploy, nhờ người dùng thử lại; nếu còn treo, gỡ lỗi trực tiếp qua `chrome://inspect` (task 5). Mã phiên bản trong menu giúp xác nhận máy đã lên bản mới.
- [Người dùng đang có SW cũ (không có handler `SKIP_WAITING`)] → SW cũ không cần handler: chỉ SW mới (đang `waiting`) nhận lệnh. Máy đang kẹt ở bản cũ vẫn phải đóng hẳn app một lần để lên bản này; từ bản này trở đi mới hết kẹt. Ghi chú cho người dùng khi phát hành.
- [iOS không có `beforeinstallprompt`/khác hành vi SW] → chỉ dùng API SW chuẩn (`update`, `waiting`, `postMessage`, `controllerchange`), có trên Safari iOS 16+.

## Migration Plan

1. Deploy như thường. Máy đang ở bản cũ: lần đầu phải đóng hẳn app (hoặc tự lên khi hệ điều hành dọn app nền) — bản cũ không có cơ chế mới.
2. Từ bản này trở đi, mọi bản sau tự lên theo D3/D4.
3. Rollback: revert commit; SW của bản revert vẫn nhận `SKIP_WAITING` nếu giữ handler — không phá gì.
