# Proposal

## Why

Máy đã từng mở bản cũ không bao giờ lên được bản mới: tải lại trang bao nhiêu lần vẫn là bản cũ, vì service worker mới chỉ được bật khi mọi tab/cửa sổ của app đã đóng hẳn — điều gần như không xảy ra với app đã cài trên điện thoại. Tệ hơn, các trang mới (vd. `/chia-tien/`) lấy từ mạng là bản mới, còn trang cũ lấy từ cache là bản cũ, nên trong cùng một phiên app nhảy qua lại giữa hai bản (đã tái hiện: đang ở Chia tiền bấm tab "Ghi nợ" thì rơi về màn chính bản cũ, mất công tắc chế độ). Trên Android, người dùng đã đăng nhập vào Ghi nợ thì bị treo "đang tải" mãi, thoát ra vào lại mới được — nghi cùng gốc với tình trạng trộn hai bản này.

## What Changes

- App tự kiểm tra bản mới mỗi lần mở và mỗi lần quay lại app (không chỉ chờ trình duyệt tự kiểm tra).
- Khi đã tải xong bản mới:
  - Nếu người dùng đang ở màn chính (Ghi nợ hoặc danh sách Chia tiền) và không mở form nào, lúc mở app hoặc quay lại app → áp dụng bản mới ngay (tải lại một lần).
  - Ở mọi màn khác → hiện thanh "Có bản mới — Cập nhật"; bấm mới tải lại. Không bao giờ tự tải lại khi đang nhập liệu.
- Sau khi áp dụng, mọi trang trong phiên đều là cùng một bản — không còn cảnh trang mới/trang cũ lẫn lộn.
- Menu phụ hiện số phiên bản đang chạy và nút "Kiểm tra bản mới" để người dùng (và người hỗ trợ) biết máy đang ở bản nào.

## Capabilities

### New Capabilities

### Modified Capabilities
- `offline-app-shell`: requirement "Cập nhật phiên bản không làm gián đoạn" đổi từ "chỉ áp dụng ở lần mở sau" sang "tự áp dụng ở màn an toàn hoặc khi người dùng bấm Cập nhật"; thêm requirement hiện phiên bản và kiểm tra bản mới trong menu.

## Impact

- `scripts/gen-sw.mjs` (service worker sinh tự động): nhận lệnh bật ngay bản mới từ trang.
- `components/Providers.tsx`: đăng ký SW, kiểm tra bản mới, điều phối áp dụng/tải lại.
- Thành phần mới: thanh "Có bản mới" hiển thị trên các màn; mục phiên bản trong `components/Menu.tsx`.
- `lib/i18n` (vi/en): chuỗi mới.
- Không đổi API server, không đổi dữ liệu IndexedDB.
