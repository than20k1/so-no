// Một lượt đồng bộ: đẩy dòng chờ (theo lô) rồi kéo tới hết (design D7, D8).
import { getDb, getMeta, markRemoteWrite, setMeta } from "../ledger/db";
import { recomputeBalance } from "../ledger/ledger";
import type { Debtor, DebtorEvent, Transaction } from "../ledger/types";
import {
  toWireDebtor,
  toWireEvent,
  toWireTransaction,
  type SyncResponseBody,
  type WireRows,
} from "./wire";

export const PUSH_BATCH = 500;
export const META = {
  cursor: "syncCursor",
  serverOffset: "serverOffset",
  lastSyncAt: "lastSyncAt",
} as const;

export class SyncAuthError extends Error {
  constructor() {
    super("unauthorized");
  }
}
export class SyncNetworkError extends Error {}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface SyncResult {
  pushed: number;
  pulled: number;
  rejected: SyncResponseBody["rejected"];
}

/** Lấy tối đa PUSH_BATCH dòng chờ; người nợ trước để giao dịch mới luôn có người nợ trên server. */
async function collectBatch(): Promise<WireRows & { size: number }> {
  const d = getDb();
  const debtors = await d.debtors.where("_dirty").equals(1).limit(PUSH_BATCH).toArray();
  let room = PUSH_BATCH - debtors.length;
  const transactions = room > 0 ? await d.transactions.where("_dirty").equals(1).limit(room).toArray() : [];
  room -= transactions.length;
  const debtorEvents = room > 0 ? await d.debtorEvents.where("_dirty").equals(1).limit(room).toArray() : [];
  return {
    debtors: debtors.map(toWireDebtor),
    transactions: transactions.map(toWireTransaction),
    debtorEvents: debtorEvents.map(toWireEvent),
    size: debtors.length + transactions.length + debtorEvents.length,
  };
}

async function post(fetchFn: FetchLike, cursor: number, push: WireRows): Promise<SyncResponseBody> {
  let res: Response;
  try {
    res = await fetchFn("/api/sync/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ cursor, push }),
    });
  } catch (err) {
    throw new SyncNetworkError(String(err));
  }
  if (res.status === 401) throw new SyncAuthError();
  if (!res.ok) throw new SyncNetworkError(`HTTP ${res.status}`);
  return (await res.json()) as SyncResponseBody;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Ghi kết quả một request vào máy trong một transaction, đánh dấu là "ghi từ server". */
async function apply(sent: WireRows, body: SyncResponseBody): Promise<number> {
  const d = getDb();
  const touched = new Set<string>();

  await d.transaction("rw", [d.debtors, d.transactions, d.debtorEvents, d.meta], async () => {
    markRemoteWrite();

    // 1. Bỏ đánh dấu dòng đã đẩy — chỉ khi dòng trên máy chưa bị sửa tiếp trong lúc request đang chạy.
    const keepDirty = new Set(body.rejected.filter((r) => r.reason === "orphan").map((r) => r.id));
    for (const w of sent.debtors) {
      const cur = await d.debtors.get(w.id);
      if (cur && !keepDirty.has(w.id) && same(toWireDebtor(cur), w)) await d.debtors.update(w.id, { _dirty: 0 });
    }
    for (const w of sent.transactions) {
      const cur = await d.transactions.get(w.id);
      if (cur && !keepDirty.has(w.id) && same(toWireTransaction(cur), w)) await d.transactions.update(w.id, { _dirty: 0 });
    }
    for (const w of sent.debtorEvents) {
      const cur = await d.debtorEvents.get(w.id);
      if (cur && same(toWireEvent(cur), w)) await d.debtorEvents.update(w.id, { _dirty: 0 });
    }

    // 2. Áp dữ liệu kéo về. Dòng máy còn đang chờ đẩy thì giữ bản máy — lượt sau server trả lại kết quả gộp.
    for (const w of body.pull.debtors) {
      const cur = await d.debtors.get(w.id);
      if (cur?._dirty === 1) continue;
      const row: Debtor = { balance: cur?.balance ?? 0, lastTxAt: cur?.lastTxAt ?? 0, ...w, _dirty: 0 };
      await d.debtors.put(row);
      touched.add(w.id);
    }
    for (const w of body.pull.transactions) {
      const cur = await d.transactions.get(w.id);
      if (cur?._dirty === 1) continue;
      await d.transactions.put({ ...(w as Transaction), _dirty: 0 });
      touched.add(w.debtorId);
    }
    for (const w of body.pull.debtorEvents) {
      const cur = await d.debtorEvents.get(w.id);
      if (cur?._dirty === 1) continue;
      await d.debtorEvents.put({ ...(w as DebtorEvent), _dirty: 0 });
    }

    await setMeta(META.cursor, body.cursor);
    await setMeta(META.serverOffset, body.serverNow - Date.now());
  });

  // 3. Số dư luôn tính lại từ giao dịch sau khi gộp (spec cloud-sync).
  for (const id of touched) await recomputeBalance(id);
  return body.pull.debtors.length + body.pull.transactions.length + body.pull.debtorEvents.length;
}

/**
 * Một lượt đồng bộ trọn vẹn: đẩy hết dòng chờ theo lô 500, rồi kéo tới khi server hết dữ liệu.
 * Ném SyncAuthError khi phiên hết hạn, SyncNetworkError khi mất mạng/lỗi server.
 */
export async function syncOnce(fetchFn: FetchLike = (i, init) => fetch(i, init)): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, rejected: [] };
  for (let round = 0; round < 1000; round++) {
    const batch = await collectBatch();
    const cursor = (await getMeta<number>(META.cursor)) ?? 0;
    const { size, ...push } = batch;
    const body = await post(fetchFn, cursor, push);
    result.pushed += size;
    result.pulled += await apply(push, body);
    result.rejected.push(...body.rejected);
    // Còn dòng chờ (lô đầy) hoặc server còn dữ liệu → lượt tiếp; ngược lại xong.
    if (size < PUSH_BATCH && !body.hasMore) break;
  }
  await setMeta(META.lastSyncAt, Date.now());
  return result;
}

/** Còn bao nhiêu dòng chờ đẩy — cho trạng thái "có thay đổi chờ gửi". */
export async function pendingCount(): Promise<number> {
  const d = getDb();
  const [a, b, c] = await Promise.all([
    d.debtors.where("_dirty").equals(1).count(),
    d.transactions.where("_dirty").equals(1).count(),
    d.debtorEvents.where("_dirty").equals(1).count(),
  ]);
  return a + b + c;
}
