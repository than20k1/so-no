# Design

## Context

Hiện trạng liên quan:

- **Máy (client).**
  - Next.js static export. Dexie ở bản 3 với các bảng `debtors`, `transactions`, `debtorEvents`.
  - Hook `markDirtyOnWrite` đặt `_dirty=1` khi app ghi; lớp sync gọi `markRemoteWrite()` để không đánh dấu dòng kéo về.
- **Server.**
  - `POST /api/sync` đẩy và kéo trong một request, dùng con trỏ `seq` lấy từ sequence chung `sync_seq`.
  - Mỗi tài khoản đúng một sổ (`books.owner_user_id` unique). Trước khi cấp `seq`, server khoá dòng sổ bằng `FOR UPDATE`, để con trỏ kéo không bỏ sót dòng commit muộn.
- **Bộ lập lịch.** `lib/sync/index.ts` được nạp lười khi có marker `so-no.account`. Nó kích hoạt sync theo storagemutated (debounce 2s), online, visibilitychange, mỗi 60s, và backoff 5s/15s/60s.
- **Đăng nhập.** Xong luôn `router.replace("/")`, chưa có tham số quay lại.
- **Ngân sách.** JS màn chính đang 178,3/180KB.

Yêu cầu nằm trong `specs/group-expenses`, `specs/group-sharing` và các delta của `home-screen`, `user-account`, `offline-app-shell`.

## Goals / Non-Goals

**Goals:**
- Tách hẳn đồng bộ nhóm khỏi đồng bộ sổ nợ: lỗi hoặc thay đổi bên này không làm hỏng bên kia, và giao thức `/api/sync` giữ nguyên.
- Máy và server tính chia tiền bằng cùng một đoạn code thuần, để kết quả luôn khớp.
- Chế độ Chia tiền không làm màn Ghi nợ nặng thêm, ngoài cái công tắc.

**Non-Goals:**
- Realtime (WebSocket/SSE) và đẩy thông báo.
- Tính tối ưu tuyệt đối số lần chuyển tiền. Bài toán tổng quát là NP-khó; spec chỉ cần không quá n−1 lần.
- Kick một thành viên có tài khoản ra khỏi nhóm. Người tạo chỉ đổi được link, không đuổi được ai.
- Sao lưu/nhập file cho nhóm. Nhóm đã nằm trên server.

## Decisions

### D1. Bảng riêng, endpoint riêng: `POST /api/groups/sync`

Nhóm có mô hình quyền khác sổ (nhiều người, thay vì một chủ), nên làm 4 bảng mới và một endpoint riêng. Không nhét nhóm vào `/api/sync`.

- Trộn vào `/api/sync` sẽ phải đổi dạng con trỏ, đổi luật `foreign`, và sửa cả phần test sổ nợ đang chạy ổn.
- Ngược lại, endpoint riêng cho phép dùng lại nguyên kiểu thiết kế (đẩy và kéo cùng request, lô 500, trang 1000, `rejected[]`, `serverNow`) mà không đụng code cũ.

**Postgres** (thời gian lưu dạng ms `bigint`; mọi bảng có `seq` mặc định `nextval('sync_seq')`):

- **`groups`**
  - `id`, `name`, `created_by_user_id`, `created_at`, `updated_at`
  - `deleted_at`, `server_deleted_at`, `purged_at`, `seq`
- **`group_invites`**: `group_id` (PK), `token`, `created_at`. Bảng này không bao giờ đi qua sync.
- **`group_members`**
  - `id`, `group_id`, `name`, `search_key`, `weight` (1–20)
  - `user_id` (null = khách), `order_key` (thời điểm thêm, dùng để làm tròn)
  - `created_at`, `updated_at`, `removed_at`, `seq`
  - Unique `(group_id, user_id)` khi `user_id` không null.
- **`expenses`**
  - `id`, `group_id`, `kind` (`expense` | `settlement`), `title`, `amount`
  - `payer_member_id`, `to_member_id` (chỉ dùng cho settlement)
  - `shares jsonb [{memberId, weight}]` (chỉ dùng cho expense)
  - `occurred_at`, `created_at`, `updated_at`, `deleted_at`
  - `updated_by_user_id`, `seq`
- **`group_events`**
  - `id`, `group_id`, `entity` (`group` | `member` | `expense`), `entity_id`
  - `kind`: create / edit / delete / restore / join / claim / leave / remove / invite_reset
  - `before jsonb`, `after jsonb`, `at`, `user_id` (server tự gắn), `device_id`, `seq`

Hai lựa chọn đáng chú ý:

- **`shares` lưu bản chụp số suất lúc ghi món**, để đổi suất của thành viên sau này không làm thay đổi món cũ (spec "Đổi suất không đổi món cũ"). Lưu JSON trong một dòng món, thay vì tách bảng `expense_shares`, để sửa món là ghi đè cả một dòng: gộp theo last-writer-wins đơn giản, không phải gộp từng phần tử.
- **Dòng thanh toán nằm chung bảng `expenses`** (`kind = settlement`), để dùng chung luồng sửa, xoá mềm, lịch sử và sync. Phần tính số dư xử lý hai loại khác nhau.

### D2. Con trỏ theo từng nhóm

Request gửi lên dạng `{ cursors: { [groupId]: seq }, push }`. Server trả về:

- `groups`: danh sách nhóm tôi đang là thành viên (id và con trỏ mới);
- `pull` gồm các dòng có `seq > cursors[g]` của từng nhóm. Nhóm máy chưa biết thì tính con trỏ bằng 0, tức tải lại từ đầu;
- `revoked: groupId[]`: những nhóm máy gửi con trỏ lên nhưng tôi không còn là thành viên (đã rời, hoặc nhóm đã tự ẩn sau 30 ngày). Máy xoá bản sao cục bộ của những nhóm này.

Lý do con trỏ phải theo nhóm: nếu dùng một con trỏ chung, người vừa vào nhóm sẽ không thấy các dòng có `seq` nhỏ hơn con trỏ hiện tại của họ.

Trang kéo tối đa 1000 dòng, gộp qua các nhóm theo `seq`. `hasMore` báo còn trang tiếp.

### D3. Khoá để con trỏ không bỏ sót dòng

Nguyên tắc giống sổ nợ. Trong một transaction:

- `SELECT … FROM groups WHERE id IN (nhóm có dòng được đẩy) ORDER BY id FOR UPDATE`;
- `… FOR SHARE` với các nhóm chỉ kéo.

Người ghi vào cùng một nhóm chạy lần lượt với nhau. Người đọc phải chờ người ghi commit xong, nên không đọc được `seq` lớn hơn trước khi `seq` nhỏ hơn kịp commit. Khoá theo thứ tự `id` để tránh deadlock.

Các endpoint join, claim, leave, invite-reset và delete cũng khoá `FOR UPDATE` dòng nhóm.

### D4. Luật gộp

| Dòng | Luật |
|---|---|
| `group_events` | Chỉ thêm (`ON CONFLICT DO NOTHING`). Server ghi đè `user_id` bằng người gửi. |
| `expenses`, `group_members` (tên, suất, `removed_at`), `groups.name` | Cả dòng: bản tới server sau cùng thắng (spec "Hai người sửa cùng một món"). |
| `groups.deleted_at` / khôi phục | Chỉ qua endpoint riêng (D6), kiểm tra quyền người tạo; sync bỏ qua các trường này nếu máy gửi lên. |
| `group_members.user_id` | Chỉ đổi qua join, claim, leave. Sync không bao giờ đổi trường này. |

Kiểm tra khi đẩy:

- Người gửi phải là thành viên của `group_id` của dòng. Nếu không, dòng bị từ chối với lý do `forbidden`.
- `payer`, `to` và mọi `memberId` trong `shares` phải thuộc cùng nhóm. Nếu không, dòng bị từ chối với lý do `invalid`.
- Chặn xoá thành viên khi đã dính món hay đã gắn tài khoản: server kiểm tra lại (quét `expenses` của nhóm) và từ chối với lý do `member_in_use`; máy nhận lại trạng thái đúng qua lần kéo sau.

Nhóm tạo lúc offline được đẩy lên như dòng mới:

- server nhận nguyên trạng, gắn `created_by_user_id` bằng người gửi;
- dòng thành viên đầu tiên được gắn `user_id` bằng người gửi, bất kể máy gửi lên giá trị gì.

### D5. Thư viện chia tiền thuần: `lib/split/`

Gồm `computeShares(expense, membersOrder)`, `balances(members, expenses)`, `settle(balances)`:

- Toàn bộ tính bằng số nguyên đồng.
- Phần góp của từng người làm tròn xuống. Phần dư chia từng đồng theo `order_key`, rồi theo `id` nếu trùng.
- `settle`: tham lam, ghép người cần trả nhiều nhất với người được nhận nhiều nhất. Khi trùng số thì xếp theo `order_key`, để máy nào cũng ra cùng thứ tự. Tối đa n−1 lần chuyển.

Server dùng chính thư viện này để kiểm tra điều kiện "số dư = 0" khi rời nhóm.

Test phải có ít nhất:

- đúng ví dụ trong ghi chú của người dùng (ra 216.000);
- 100.000 chia 3 (33.334 / 33.333 / 33.333);
- kiểm thử ngẫu nhiên: tổng số dư luôn bằng 0, và sau khi áp kết quả thì ai cũng về 0.

### D6. Endpoint không đi qua sync

Tất cả dưới `/api/groups/`, cần đăng nhập, POST dạng JSON, và đi qua lớp chặn Origin hiện có:

| Endpoint | Việc |
|---|---|
| `POST /:id/invite` | Trả link. Token 32 byte ngẫu nhiên, base64url, lưu trong `group_invites`. Lần gọi đầu tạo token; các lần sau trả lại token đang dùng. |
| `POST /:id/invite/reset` | Chỉ người tạo nhóm: tạo token mới, token cũ mất hiệu lực. |
| `POST /join/preview` `{token}` | Tên nhóm, thành viên (tên, suất, khách hay đã có chủ), và cho biết tôi đã là thành viên chưa. |
| `POST /join` `{token, memberId?, name?}` | Nhận vị trí khách có sẵn (`UPDATE … WHERE user_id IS NULL`; 0 dòng bị đổi thì trả `409 taken`), hoặc thêm thành viên mới. Ghi event `claim` hoặc `join`. |
| `POST /:id/leave` | Kiểm tra số dư bằng 0 bằng `lib/split`, rồi đặt `user_id = null` và ghi event `leave`. |
| `POST /:id/delete`, `/:id/restore` | Chỉ người tạo nhóm. |

Vì sao cần token thay vì chỉ dùng id nhóm: id nhóm nằm trong URL và dữ liệu sync, nên không được coi là bí mật.

Token lưu thẳng (không hash), vì mọi thành viên cần lấy lại được đúng link đang dùng. Server so sánh token bằng hàm constant-time.

Giới hạn tần suất `join/preview` và `join` theo tài khoản, dùng lại bảng `rate_limit` có sẵn, để không dò token được.

Link có dạng `https://<host>/chia-tien/tham-gia/#<token>`:

- Token đặt sau dấu `#` nên không lọt vào log của server hay CDN.
- Trang tĩnh đọc `location.hash`, rồi gọi API `preview`.

### D7. Dữ liệu trên máy: Dexie bản 4

Thêm các bảng:

- `groups: "id, _dirty"`
- `groupMembers: "id, groupId, _dirty"`
- `expenses: "id, groupId, _dirty"`
- `groupEvents: "id, groupId, entityId, _dirty"`

Mở rộng `SYNCED_TABLES` / `SYNCED_FIELDS` để hook `_dirty` áp luôn cho các bảng này. Bảng `meta` thêm:

- `groupCursors`: map từ groupId sang seq;
- `groupSelfName`: tên đã dùng lần gần nhất.

Không đưa số dư vào DB mà tính khi render bằng `lib/split`, vì một nhóm chỉ vài trăm món. Như vậy khỏi phải lo đồng bộ cache số dư như bên sổ nợ.

Sau khi đăng nhập, `attachAccount` giữ nguyên. Nhóm không cần gắn lại mã sổ, vì chỉ tạo được khi đã đăng nhập.

### D8. Lớp đồng bộ nhóm: `lib/groups/sync.ts`

- `syncGroupsOnce()` có cấu trúc giống `syncOnce`: gom lô dòng `_dirty` (nhóm trước, rồi thành viên, rồi món, rồi event), POST, áp kết quả trong transaction `markRemoteWrite`, rồi xử lý `revoked`.
- Bộ lập lịch trong `lib/sync/index.ts` gọi `syncGroupsOnce` ngay sau `syncOnce`, qua `import()` động, nên không tăng bundle màn chính.
  - Lỗi của bên này không làm hỏng bên kia: lỗi mạng hay 5xx của nhóm vẫn vào trạng thái backoff chung, nhưng không chặn đồng bộ sổ nợ ở lượt sau.
  - 401 thì dùng chung trạng thái `needs_login`.
- `pendingCount` cộng cả dòng nhóm, để menu báo "có thay đổi chờ gửi" đúng.
- `logout`: luôn xoá 4 bảng nhóm và `groupCursors`. Nếu đang có dòng nhóm `_dirty`, cảnh báo như sổ nợ (xem delta `user-account`).

### D9. Giao diện và định tuyến

- **Trang**, mỗi trang tĩnh là một chunk tải lười:
  - `/chia-tien/`: danh sách nhóm;
  - `/chia-tien/nhom/?id=`: chi tiết nhóm, gồm tab Chi tiêu, Kết quả, Thành viên, Lịch sử;
  - `/chia-tien/mon/?g=&id=`: thêm hoặc sửa món và dòng thanh toán;
  - `/chia-tien/tham-gia/#token`: vào nhóm.
- **Service worker** precache các trang này, nên mở offline được.
- **Công tắc `ModeSwitch`**: component nhỏ trong header dùng chung cho `/` và `/chia-tien/`. Nó là `<Link>` kèm `aria-current`, không phải state.
  - Chế độ lưu ở `localStorage["so-no.mode"]`.
  - Ở `/`, một script inline nhỏ đặt trong `layout` chạy trước khi hydrate: nếu `mode === "chia-tien"` thì `location.replace("/chia-tien/")`. Nhờ vậy màn Ghi nợ không bị nháy lên trước.
  - Công tắc là tab (không phải link, để không trùng tên với nút lớn "Ghi nợ"). Chạm tab ghi lại chế độ trước khi chuyển trang; chuyển trang trong app không chạy lại script nên không cần tham số `?stay`.
- **Header 360px**: `[=]` (48px), công tắc (khoảng 176px), tổng tiền (phần còn lại, chữ `text-lg`, có `truncate`). Ở màn Chia tiền, vị trí tổng tiền hiện "Bạn cần trả / được nhận" gộp qua các nhóm.
- **i18n**: chuỗi của phần nhóm để ở `lib/i18n/groups.ts` với hook `useGroupsT`, giống cách tách `account.ts`. Riêng nhãn công tắc nằm ở từ điển chính.
- **Đăng nhập có `?next=`**: `useFinishLogin` chỉ chấp nhận đường dẫn tương đối bắt đầu bằng `/` và không bắt đầu bằng `//`, để tránh open redirect. Màn Chia tiền và màn tham gia gửi kèm `next`. Link tham gia giữ token qua `sessionStorage` vì phần `#…` bị mất khi chuyển trang đăng nhập.
- **Chia sẻ link**: dùng `navigator.share`, nếu không có thì sao chép vào clipboard.
- **Mã QR**: sinh bằng thư viện nhỏ `qrcode-generator` (khoảng 10KB), import động chỉ khi bấm "Hiện mã QR".

### D10. Xoá nhóm và tự ẩn sau 30 ngày

Giống người nợ nhưng không có bước "xoá hẳn thủ công":

- `delete` đặt `deleted_at` và `server_deleted_at`.
- Mỗi lần sync, server ẩn những nhóm `deleted` đã quá 30 ngày bằng cách đặt `purged_at`.
- Nhóm có `purged_at` không bao giờ trả về, và nằm trong `revoked`.
- Dữ liệu vẫn còn trong DB. Muốn khôi phục thì dùng công cụ admin; mở rộng `scripts/admin-restore.ts` là việc tuỳ chọn, không nằm trong phạm vi bắt buộc.

## Risks / Trade-offs

- **[Người tạo rời nhóm thì không ai xoá được nhóm, cũng không ai đổi được link]** → Chấp nhận ở bản này. Chỉ báo trước khi người tạo bấm rời. Cách chuyển quyền để làm sau.
- **[Ai có link cũng vào được: link lọt ra ngoài thì người lạ vào xem được chi tiêu]** → Người tạo đổi được link. Lịch sử có event `join` để thấy ai vào. Token 256 bit nên không đoán được. Có giới hạn tần suất.
- **[Last-writer-wins trên cả dòng món: hai người sửa hai trường khác nhau của cùng một món thì một bản sửa bị đè]** → Hiếm gặp. Lịch sử giữ đủ cả hai bản, nên xem lại được. Gộp theo từng trường làm phức tạp `shares` mà được ít.
- **[Nhóm lớn: 50 người, hàng nghìn món]** → Tính số dư mỗi lần render là O(món × người). Với vài nghìn món vẫn dưới 10ms, nên chỉ `useMemo` theo phiên bản dữ liệu.
- **[Tải Neon miễn phí: mỗi lượt sync thêm một request cho nhóm]** → Chỉ gọi khi tài khoản có ít nhất một nhóm, hoặc khi đang mở màn Chia tiền. Nếu lần trước trả về `groups` rỗng và không có dòng chờ đẩy, bỏ qua lượt định kỳ; chỉ gọi lại khi vào màn Chia tiền hoặc sau 10 phút.
- **[Script chuyển chế độ ở `/` chạy trước khi hydrate]** → Script vài dòng, bọc try/catch, lỗi thì ở lại Ghi nợ. Có e2e kiểm tra: mở lại app thì vào đúng chế độ, và chọn Ghi nợ rồi tải lại thì vẫn ở Ghi nợ.
- **[Ngân sách 180KB]** → Công tắc khoảng 1KB. Mọi thứ khác nằm trong route riêng. Kiểm tra budget có sẵn chạy trong CI.

## Migration Plan

1. Migration drizzle `0001_groups.sql` chỉ thêm bảng mới, không đụng bảng cũ. Nó tự chạy khi deploy Production (cơ chế `db:migrate:deploy` đã có).
2. Dexie bản 4 chỉ thêm bảng, không đổi dữ liệu sổ.
3. Rollback: Dexie không mở được DB có version cao hơn version code khai báo, nên nếu phải revert thì vẫn giữ khai báo bản 4 (bảng nhóm để trống, không dùng) và chỉ gỡ giao diện và endpoint. Bảng Postgres mới để nguyên cũng vô hại. Test nâng cấp bản 3 → 4 phải kiểm tra sổ cũ còn nguyên, giống bản 2 và bản 3.

## Open Questions

- Tên chuỗi tiếng Anh cho chế độ ("Split" hay "Split bills"): chốt lúc viết `groups.ts`, không ảnh hưởng thiết kế.
