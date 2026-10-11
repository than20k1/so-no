# Proposal

## Why

Tạo nhóm hiện chỉ có tên nhóm và tên mình; muốn có đủ người phải vào tab Thành viên thêm từng người một trước khi ghi được khoản chi đầu tiên — chậm khi cả nhóm đang ngồi cạnh nhau. Nút "+ Thêm món" màu đỏ trùng màu "Ghi nợ" và chữ "món" không hợp với mọi khoản chi (vé xe, phòng…). Người tạo nhóm vẫn thấy nút "Rời nhóm", rời xong thì không ai xoá được nhóm hay đổi link mời nữa.

## What Changes

- Form tạo nhóm:
  - Nhãn ô tên mình đổi thành "Tên trưởng nhóm (tài khoản này)".
  - Thêm ô "Thành viên" nhiều dòng, mỗi dòng một người; app đếm và hiện số người ngay khi gõ. Các thành viên này được tạo là khách, 1 suất, cùng lúc với nhóm.
  - Tên trùng nhau (so sánh bỏ dấu, không phân biệt hoa thường), kể cả trùng tên trưởng nhóm, → báo lỗi nêu rõ tên bị trùng, vd. "Có 2 người tên “Vũ” trùng nhau", và không tạo nhóm.
- Nút thêm khoản chi trong nhóm đổi thành "+ Thêm chi tiêu", màu xanh lá; tiêu đề màn nhập và dòng "Chưa có…" đổi theo.
- Người tạo nhóm không thấy nút "Rời nhóm" (chỉ còn "Xoá nhóm"); server cũng từ chối yêu cầu rời nhóm của người tạo.

## Capabilities

### New Capabilities

### Modified Capabilities
- `group-expenses`: "Tạo nhóm" thêm danh sách thành viên và nhãn trưởng nhóm; "Ghi món chi tiêu" quy định nút "+ Thêm chi tiêu" màu xanh lá.
- `group-sharing`: "Rời nhóm" — người tạo nhóm không rời được nhóm.

## Impact

- `components/groups/GroupsScreen.tsx` (form tạo nhóm), `components/groups/GroupDetail.tsx` (nút thêm chi tiêu, ẩn Rời nhóm), `components/groups/ExpenseForm.tsx` (tiêu đề).
- `lib/groups/groups.ts`: `createGroup` nhận thêm danh sách thành viên, tạo trong cùng transaction.
- `server/groups.ts`: route `POST /:id/leave` từ chối người tạo.
- `lib/i18n/groups.ts` (vi/en): đổi chuỗi, bỏ `leaveCreatorWarn`.
- Không đổi schema IndexedDB hay giao thức đồng bộ: thành viên khách đi qua đường đồng bộ sẵn có.
