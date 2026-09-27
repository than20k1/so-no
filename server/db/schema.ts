// Schema Postgres của server. Hai phần:
//  1. Bảng của Better Auth (tên và cột theo đúng yêu cầu của thư viện — xem design D3).
//  2. Bảng sổ nợ, ánh xạ 1-1 với dữ liệu trong trình duyệt (lib/ledger/types.ts) + cột đồng bộ `seq` (design D6).
// Thời gian của sổ nợ lưu epoch ms (bigint) giống trình duyệt để không lệch khi đổi qua lại.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Better Auth
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  phoneNumber: text("phone_number").unique(),
  phoneNumberVerified: boolean("phone_number_verified"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// ---------------------------------------------------------------------------
// Khoá đăng nhập theo số điện thoại (design D4)
// ---------------------------------------------------------------------------

export const loginThrottle = pgTable("login_throttle", {
  phone: text("phone").primaryKey(),
  failures: integer("failures").notNull().default(0),
  lockedUntil: bigint("locked_until", { mode: "number" }),
});

// ---------------------------------------------------------------------------
// Sổ nợ
// ---------------------------------------------------------------------------

/** Con trỏ đồng bộ chung: mỗi lần server ghi/đổi một dòng thì dòng đó nhận `seq` mới. */
export const syncSeq = pgSequence("sync_seq");
const nextSeq = sql`nextval('sync_seq')`;
const ms = (name: string) => bigint(name, { mode: "number" });

export const books = pgTable("books", {
  id: uuid("id").primaryKey(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: ms("created_at").notNull(),
});

export const debtors = pgTable(
  "debtors",
  {
    id: uuid("id").primaryKey(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    note: text("note").notNull().default(""),
    searchKey: text("search_key").notNull(),
    createdAt: ms("created_at").notNull(),
    updatedAt: ms("updated_at").notNull(),
    deletedAt: ms("deleted_at"),
    purgedAt: ms("purged_at"),
    /** Giờ server khi lần đầu thấy người này bị xoá — dùng cho mốc 15/30 ngày (design D7). */
    serverDeletedAt: ms("server_deleted_at"),
    seq: bigint("seq", { mode: "number" }).notNull().default(nextSeq),
  },
  (t) => [index("debtors_book_seq_idx").on(t.bookId, t.seq)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    debtorId: uuid("debtor_id").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    kind: text("kind").notNull(),
    direction: text("direction").notNull(),
    occurredAt: ms("occurred_at"),
    createdAt: ms("created_at").notNull(),
    updatedAt: ms("updated_at").notNull(),
    voidedAt: ms("voided_at"),
    source: text("source").notNull(),
    note: text("note").notNull().default(""),
    deviceId: text("device_id").notNull().default(""),
    seq: bigint("seq", { mode: "number" }).notNull().default(nextSeq),
  },
  (t) => [index("transactions_book_seq_idx").on(t.bookId, t.seq)],
);

export const debtorEvents = pgTable(
  "debtor_events",
  {
    id: uuid("id").primaryKey(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    debtorId: uuid("debtor_id").notNull(),
    kind: text("kind").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    at: ms("at").notNull(),
    deviceId: text("device_id").notNull().default(""),
    seq: bigint("seq", { mode: "number" }).notNull().default(nextSeq),
  },
  (t) => [index("debtor_events_book_seq_idx").on(t.bookId, t.seq)],
);

// ---------------------------------------------------------------------------
// Chia tiền nhóm (change chia-tien-nhom, design D1). Mỗi dòng mang `group_id`; quyền theo thành viên nhóm.
// ---------------------------------------------------------------------------

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id),
  createdAt: ms("created_at").notNull(),
  updatedAt: ms("updated_at").notNull(),
  deletedAt: ms("deleted_at"),
  /** Giờ server khi nhóm bị xoá — mốc 30 ngày tự ẩn (design D10). */
  serverDeletedAt: ms("server_deleted_at"),
  purgedAt: ms("purged_at"),
  seq: bigint("seq", { mode: "number" }).notNull().default(nextSeq),
});

export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    searchKey: text("search_key").notNull(),
    weight: integer("weight").notNull().default(1),
    /** null = khách (chỉ có tên). Chỉ đổi qua vào/nhận/rời nhóm, không bao giờ qua đồng bộ. */
    userId: text("user_id").references(() => user.id),
    /** Thứ tự vào nhóm — ai nhận phần dư khi làm tròn. */
    orderKey: ms("order_key").notNull(),
    createdAt: ms("created_at").notNull(),
    updatedAt: ms("updated_at").notNull(),
    removedAt: ms("removed_at"),
    seq: bigint("seq", { mode: "number" }).notNull().default(nextSeq),
  },
  (t) => [
    index("group_members_group_seq_idx").on(t.groupId, t.seq),
    index("group_members_user_idx").on(t.userId),
    uniqueIndex("group_members_group_user_uq").on(t.groupId, t.userId).where(sql`${t.userId} is not null`),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull().default(""),
    amount: bigint("amount", { mode: "number" }).notNull(),
    payerMemberId: uuid("payer_member_id").notNull(),
    toMemberId: uuid("to_member_id"),
    shares: jsonb("shares"),
    occurredAt: ms("occurred_at").notNull(),
    createdAt: ms("created_at").notNull(),
    updatedAt: ms("updated_at").notNull(),
    deletedAt: ms("deleted_at"),
    updatedByUserId: text("updated_by_user_id"),
    seq: bigint("seq", { mode: "number" }).notNull().default(nextSeq),
  },
  (t) => [index("expenses_group_seq_idx").on(t.groupId, t.seq)],
);

export const groupEvents = pgTable(
  "group_events",
  {
    id: uuid("id").primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    kind: text("kind").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    at: ms("at").notNull(),
    /** Server tự gắn theo phiên — máy không khai được "ai làm". */
    userId: text("user_id"),
    /** Thành viên của người làm trong nhóm lúc đó — để hiện tên "ai làm" (spec lịch sử nhóm). */
    actorMemberId: uuid("actor_member_id"),
    deviceId: text("device_id").notNull().default(""),
    seq: bigint("seq", { mode: "number" }).notNull().default(nextSeq),
  },
  (t) => [index("group_events_group_seq_idx").on(t.groupId, t.seq)],
);

/** Link mời — không bao giờ đi qua đồng bộ; chỉ đọc qua endpoint cho thành viên (design D6). */
export const groupInvites = pgTable("group_invites", {
  groupId: uuid("group_id")
    .primaryKey()
    .references(() => groups.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdAt: ms("created_at").notNull(),
});
