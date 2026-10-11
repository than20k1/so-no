# Design

## Context

- `createGroup({ name, selfName })` trong `lib/groups/groups.ts` tạo nhóm + thành viên tài khoản trong một transaction Dexie, ghi event `create` cho nhóm và thành viên; đồng bộ đi theo dòng `_dirty` như mọi thay đổi khác.
- `addGuest` đã có sẵn quy tắc tên (`cleanName`: bỏ khoảng trắng thừa, không trống, tối đa `GROUP_LIMITS.maxText`), so trùng bằng `normalizeName` (bỏ dấu, chữ thường), giới hạn `GROUP_LIMITS.maxMembers`.
- Route server `POST /groups/:id/leave` chỉ kiểm tra số dư, chưa phân biệt người tạo (`groups.createdByUserId`).

## Goals / Non-Goals

**Goals:**
- Tạo nhóm kèm danh sách thành viên trong một thao tác, một transaction, chạy được offline.
- Báo trùng tên ngay trên form, trước khi ghi gì.

**Non-Goals:**
- Không cho nhập số suất trong ô danh sách (vd. "Vũ x2") — sửa suất sau ở tab Thành viên.
- Không đổi chữ "món" ở những chỗ khác (danh sách món, lịch sử, mục "Đã xoá").
- Không xử lý nhóm cũ mà người tạo đã rời trước bản này.

## Decisions

### D1. `createGroup` nhận thêm `guests: string[]`, cùng một transaction
Mở rộng thành `createGroup({ name, selfName, guests = [] })`. Làm sạch và kiểm tra toàn bộ tên **trước** khi mở transaction (hàm thuần `checkGuestList(selfName, guests)`), rồi trong transaction thêm trưởng nhóm, sau đó thêm từng khách với `orderKey` tăng dần theo thứ tự gõ (dùng `stamp()`), mỗi khách ghi một event `member/create` như `addGuest`.
- *Thay thế*: gọi `createGroup` rồi `addGuest` lặp → nhóm có thể tạo dở nếu một tên lỗi, và nhiều transaction chậm hơn. Loại.

### D2. Kiểm tra trùng là hàm thuần dùng chung cho form và lõi
`parseGuestList(text)` → danh sách tên đã làm sạch (bỏ dòng trống). `findDuplicates(selfName, guests)` → `[{ name, count }]` theo `normalizeName`, `name` là cách viết lần đầu xuất hiện. Form gọi để hiện lỗi và bộ đếm "N người" trực tiếp khi gõ; `createGroup` gọi lại để chặn (ném `GroupError("duplicate_names")`) — không tin riêng giao diện.
Thông báo: một tên trùng → "Có {count} người tên “{name}” trùng nhau"; nhiều tên → liệt kê từng tên trên cùng một dòng lỗi.

### D3. Ô danh sách là `<textarea>`
Mỗi dòng một người, `autocapitalize="words"`, không tự sửa chính tả, cao tự giãn khoảng 4–8 dòng. Bộ đếm hiện dưới ô: "{n} người" (trưởng nhóm + khách).

### D4. Ẩn "Rời nhóm" theo `isCreator`, server chặn theo `createdByUserId`
Giao diện dùng `GroupView.isCreator` đã có. Server: trong transaction của `/leave`, đọc nhóm; nếu `createdByUserId === me.userId` → `403 creator_cannot_leave`. Bỏ chuỗi `leaveCreatorWarn`.

### D5. Nút "+ Thêm chi tiêu" dùng token màu `pay`
Đổi `bg-add`/`active:bg-add-press` thành `bg-pay`/`active:bg-pay-press` (xanh lá, cùng màu nút "Trừ nợ"); đổi các khoá i18n `addExpense`, `newExpense`, `noExpenses` (vi: "Thêm chi tiêu", "Chưa có chi tiêu nào. Bấm “Thêm chi tiêu” để ghi khoản đầu tiên."; en giữ "Add expense").

## Risks / Trade-offs

- [Dán danh sách dài vượt giới hạn thành viên] → bộ đếm chuyển màu lỗi và nút Tạo nhóm bị chặn kèm lời báo trước khi ghi.
- [Máy khác chạy bản cũ nhận nhóm có nhiều khách ngay từ đầu] → không vấn đề: khách đi qua đường đồng bộ thành viên sẵn có.
- [Trưởng nhóm đã rời ở bản cũ] → vẫn như cũ (không ai xoá được nhóm); ngoài phạm vi.
