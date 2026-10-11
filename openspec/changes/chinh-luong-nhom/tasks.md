# Tasks

## 1. Lõi tạo nhóm kèm thành viên

- [x] 1.1 Viết `parseGuestList` và `findDuplicates` (hàm thuần trong `lib/groups/`), unit test: bỏ dòng trống và khoảng trắng, trùng giữa các dòng ("Vũ"/"vu"), trùng với trưởng nhóm, nhiều tên trùng
- [x] 1.2 Mở rộng `createGroup` nhận `guests`, kiểm tra trùng và giới hạn thành viên trước transaction, thêm khách theo thứ tự trong cùng transaction kèm event; mở rộng `lib/groups/groups.test.ts`: tạo "Đà Lạt" với Vũ/Hoàng/Lương → 4 thành viên đúng thứ tự, 1 suất, trùng tên → không có nhóm nào được tạo
- [x] 1.3 Kiểm tra đồng bộ: mở rộng `lib/groups/sync.test.ts` — nhóm tạo kèm khách lúc offline lên server đủ thành viên và máy thứ hai kéo về đủ

## 2. Form tạo nhóm

- [x] 2.1 Trong `components/groups/GroupsScreen.tsx`, đổi nhãn thành "Tên trưởng nhóm (tài khoản này)", thêm textarea "Thành viên (mỗi dòng một người)" và bộ đếm "{n} người"; thêm chuỗi vi/en trong `lib/i18n/groups.ts`
- [x] 2.2 Hiện lỗi trùng ngay khi gõ và chặn nút Tạo nhóm, giữ nguyên nội dung đã gõ; test component: gõ "Vũ\nvu" → thấy "Có 2 người tên “Vũ” trùng nhau", bấm tạo không tạo nhóm

## 3. Thêm chi tiêu

- [x] 3.1 Đổi nút trong `GroupDetail.tsx` thành "+ Thêm chi tiêu" màu `bg-pay`, tiêu đề `ExpenseForm` "Thêm chi tiêu", dòng trống "Chưa có chi tiêu nào…"; cập nhật các test/e2e đang tìm chữ "Thêm món" (`grep -rn "Thêm món"` không còn kết quả ngoài lịch sử)

## 4. Rời nhóm

- [x] 4.1 Ẩn nút "Rời nhóm" khi `g.isCreator`, bỏ `leaveCreatorWarn`; test component: người tạo không thấy nút, thành viên khác vẫn thấy
- [x] 4.2 Server `POST /groups/:id/leave` trả `403 creator_cannot_leave` cho người tạo; test API: người tạo gọi → 403, vẫn là thành viên; thành viên thường số dư 0 → rời được như cũ

## 5. Kiểm thử đầu-cuối

- [x] 5.1 Cập nhật `e2e/groups.spec.ts`: tạo nhóm kèm 3 thành viên, thấy đủ ở tab Thành viên; nút "+ Thêm chi tiêu" mở màn "Thêm chi tiêu"; người tạo không thấy "Rời nhóm"
- [x] 5.2 Chạy `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e` đều qua
