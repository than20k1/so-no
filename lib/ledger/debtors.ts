import { newId } from "../id";
import { cleanDisplayName, normalizeName } from "../text";
import { getContext, getDb, getMeta, readBookId } from "./db";
import { LedgerError } from "./ledger";
import type { Debtor, DebtorEvent, DebtorEventKind, DebtorFields } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Trong 15 ngày đầu ở thùng rác chỉ khôi phục được, chưa được xoá hẳn. */
export const PURGE_ALLOWED_MS = 15 * DAY_MS;
/** Đủ 30 ngày thì app tự xoá hẳn. */
export const AUTO_PURGE_MS = 30 * DAY_MS;

export interface TrashState {
  canPurge: boolean;
  purgeAllowedAt: number;
  autoPurgeAt: number;
  /** Số ngày (làm tròn lên) còn lại trước khi tự xoá hẳn; 0 nếu đã tới hạn. */
  daysLeft: number;
}

/** Mốc 15/30 ngày tính đủ theo mili giây từ lúc xoá, không làm tròn theo ngày lịch. */
export function trashState(deletedAt: number, now = Date.now()): TrashState {
  const purgeAllowedAt = deletedAt + PURGE_ALLOWED_MS;
  const autoPurgeAt = deletedAt + AUTO_PURGE_MS;
  return {
    canPurge: now >= purgeAllowedAt,
    purgeAllowedAt,
    autoPurgeAt,
    daysLeft: Math.max(0, Math.ceil((autoPurgeAt - now) / DAY_MS)),
  };
}

/**
 * "Bây giờ" dùng cho mốc thùng rác: khi đã đăng nhập, lấy theo giờ server (lệch so với máy được lưu sau mỗi lượt
 * đồng bộ), để chỉnh đồng hồ điện thoại không lách được mốc 15/30 ngày (spec cloud-sync, design D10).
 */
export async function trustedNow(): Promise<number> {
  const [account, offset] = await Promise.all([getMeta<string>("accountUserId"), getMeta<number>("serverOffset")]);
  return Date.now() + (account && typeof offset === "number" ? offset : 0);
}

/**
 * Sửa dòng người nợ và ghi sự kiện trong cùng một transaction.
 * `change` trả `null` nếu không có gì thay đổi → không ghi gì.
 */
async function mutate(
  debtorId: string,
  kind: DebtorEventKind,
  change: (d: Debtor, now: number) => { debtor: Debtor; before?: DebtorFields; after?: DebtorFields } | null,
  now = Date.now(),
): Promise<Debtor> {
  const { deviceId } = await getContext();
  const d = getDb();
  return d.transaction("rw", d.debtors, d.debtorEvents, async () => {
    const current = await d.debtors.get(debtorId);
    if (!current || current.purgedAt) throw new LedgerError("debtor_not_found");
    const result = change(current, now);
    if (!result) return current;
    const debtor = { ...result.debtor, updatedAt: now };
    const event: DebtorEvent = {
      id: newId(),
      bookId: current.bookId,
      debtorId,
      kind,
      before: result.before ?? null,
      after: result.after ?? null,
      at: now,
      deviceId,
    };
    await d.debtors.put(debtor);
    await d.debtorEvents.add(event);
    return debtor;
  });
}

/** Sửa tên và ghi chú phân biệt; không đổi gì thì không ghi sự kiện. */
export function editDebtor(debtorId: string, fields: DebtorFields): Promise<Debtor> {
  const name = cleanDisplayName(fields.name);
  const note = cleanDisplayName(fields.note);
  if (!name) return Promise.reject(new LedgerError("invalid_name"));
  return mutate(debtorId, "edit", (cur) => {
    if (cur.deletedAt) throw new LedgerError("debtor_deleted");
    if (cur.name === name && cur.note === note) return null;
    return {
      debtor: { ...cur, name, note, searchKey: normalizeName(name) },
      before: { name: cur.name, note: cur.note },
      after: { name, note },
    };
  });
}

/** Cho vào thùng rác. Giao dịch giữ nguyên. */
export function deleteDebtor(debtorId: string, now = Date.now()): Promise<Debtor> {
  return mutate(
    debtorId,
    "delete",
    (cur, at) => (cur.deletedAt ? null : { debtor: { ...cur, deletedAt: at } }),
    now,
  );
}

/** Lấy lại từ thùng rác (cũng là "Hoàn tác" sau khi xoá). */
export function restoreDebtor(debtorId: string, now = Date.now()): Promise<Debtor> {
  return mutate(
    debtorId,
    "restore",
    (cur) => (cur.deletedAt ? { debtor: { ...cur, deletedAt: null } } : null),
    now,
  );
}

/** Xoá hẳn = ẩn vĩnh viễn; dữ liệu vẫn nằm trên máy và trong file sao lưu. Chỉ được khi đã đủ 15 ngày. */
export async function purgeDebtor(debtorId: string, now?: number): Promise<Debtor> {
  now ??= await trustedNow();
  return mutate(
    debtorId,
    "purge",
    (cur, at) => {
      if (!cur.deletedAt) throw new LedgerError("debtor_not_found");
      if (!trashState(cur.deletedAt, at).canPurge) throw new LedgerError("purge_too_early");
      return { debtor: { ...cur, purgedAt: at } };
    },
    now,
  );
}

/** Người trong thùng rác của sổ hiện tại, mới xoá ở trên. */
export async function listTrash(): Promise<Debtor[]> {
  const bookId = await readBookId();
  if (!bookId) return [];
  const rows = await getDb()
    .debtors.where("bookId")
    .equals(bookId)
    .filter((d) => !!d.deletedAt && !d.purgedAt)
    .toArray();
  return rows.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

/** Tự xoá hẳn những người đã nằm thùng rác đủ 30 ngày. Trả số người vừa xoá hẳn. */
export async function purgeExpired(now?: number): Promise<number> {
  now ??= await trustedNow();
  const at = now;
  const expired = (await listTrash()).filter((d) => at >= trashState(d.deletedAt!, at).autoPurgeAt);
  for (const d of expired) await purgeDebtor(d.id, at);
  return expired.length;
}

/** Lịch sử sửa của một người, mới nhất ở trên. */
export async function getDebtorEvents(debtorId: string): Promise<DebtorEvent[]> {
  const events = await getDb().debtorEvents.where("debtorId").equals(debtorId).toArray();
  return events.sort((a, b) => b.at - a.at);
}
