// Dạng dữ liệu trao đổi với POST /api/groups/sync — dùng chung cho máy và server (chỉ có kiểu, không có code).

export interface WireGroup {
  id: string;
  name: string;
  /** Server gắn; máy gửi lên thì bị bỏ qua. */
  createdByUserId?: string;
  createdAt: number;
  updatedAt: number;
  /** Chỉ đổi qua endpoint xoá/khôi phục; máy gửi lên thì bị bỏ qua. */
  deletedAt: number | null;
}

export interface WireMember {
  id: string;
  groupId: string;
  name: string;
  searchKey: string;
  weight: number;
  /** null = khách. Chỉ server đổi (vào/nhận/rời nhóm); máy chỉ gửi được khi tạo nhóm cho chính mình. */
  userId: string | null;
  orderKey: number;
  createdAt: number;
  updatedAt: number;
  removedAt: number | null;
}

export interface WireShare {
  memberId: string;
  weight: number;
}

export interface WireExpense {
  id: string;
  groupId: string;
  kind: "expense" | "settlement";
  title: string;
  amount: number;
  payerMemberId: string;
  toMemberId: string | null;
  shares: WireShare[] | null;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type GroupEventEntity = "group" | "member" | "expense";
export type GroupEventKind =
  | "create"
  | "edit"
  | "delete"
  | "restore"
  | "join"
  | "claim"
  | "leave"
  | "remove"
  | "invite_reset";

export interface WireGroupEvent {
  id: string;
  groupId: string;
  entity: GroupEventEntity;
  entityId: string;
  kind: GroupEventKind;
  before: unknown;
  after: unknown;
  at: number;
  /** Server gắn theo phiên. */
  userId?: string | null;
  actorMemberId?: string | null;
  deviceId: string;
}

export interface GroupRows {
  groups: WireGroup[];
  members: WireMember[];
  expenses: WireExpense[];
  events: WireGroupEvent[];
}

export type GroupRejectReason = "invalid" | "forbidden" | "member_in_use" | "limit";

export interface GroupRejected {
  table: keyof GroupRows;
  id: string;
  reason: GroupRejectReason;
}

export interface GroupSyncRequest {
  cursors: Record<string, number>;
  push: GroupRows;
}

export interface GroupSyncResponse {
  /** Con trỏ mới của từng nhóm có dữ liệu trong trang này. */
  cursors: Record<string, number>;
  /** Các nhóm tài khoản đang là thành viên (kể cả nhóm đang trong thùng rác). */
  groups: string[];
  /** Nhóm máy đang giữ nhưng không còn quyền xem (đã rời / nhóm đã ẩn hẳn) — máy xoá bản sao. */
  revoked: string[];
  pull: GroupRows;
  hasMore: boolean;
  rejected: GroupRejected[];
  serverNow: number;
}

export const GROUP_LIMITS = {
  maxMembers: 50,
  maxWeight: 20,
  maxText: 200,
  maxAmount: 1_000_000_000,
  autoPurgeMs: 30 * 24 * 60 * 60 * 1000,
} as const;
