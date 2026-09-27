// Điều phối đồng bộ trên trình duyệt (design D11). Chỉ được tải khi máy đã đăng nhập hoặc khi mở màn tài khoản.
import Dexie from "dexie";
import { pendingGroupCount, wipeGroups } from "../groups/groups";
import { getMeta } from "../ledger/db";
import { attachAccount, wipeLocalBook, type AttachResult, type Me } from "./account";
import { accountApi } from "./api";
import { META, pendingCount, syncOnce, SyncAuthError, type FetchLike } from "./engine";
import { readAccountMarker, writeAccountMarker } from "./marker";

export type SyncPhase = "idle" | "syncing" | "offline" | "error" | "needs_login";

export interface SyncState {
  phone: string | null;
  phase: SyncPhase;
  pending: number;
  lastSyncAt: number | null;
}

const DEBOUNCE_MS = 2000;
const INTERVAL_MS = 60_000;
export const BACKOFF_MS = [5_000, 15_000, 60_000];
/** Tài khoản không có nhóm nào: chỉ hỏi server về nhóm thưa thế này (design Risks — tải Neon miễn phí). */
export const IDLE_GROUP_SYNC_MS = 10 * 60_000;

let state: SyncState = { phone: readAccountMarker()?.phone ?? null, phase: "idle", pending: 0, lastSyncAt: null };
const listeners = new Set<() => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const syncStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getState: () => state,
};

// ---------------------------------------------------------------------------
// Vòng chạy
// ---------------------------------------------------------------------------

let started = false;
let running: Promise<void> | null = null;
let again = false;
let failures = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let fetchFn: FetchLike = (i, init) => fetch(i, init);
/** Số nhóm tài khoản đang có theo lần đồng bộ nhóm gần nhất; `null` = chưa biết. */
let groupCount: number | null = null;
let lastGroupSyncAt = 0;
let forceGroups = false;
const cleanups: (() => void)[] = [];

function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

/** Cập nhật số dòng chờ gửi và lần đồng bộ gần nhất trong trạng thái (vd. khi mở menu). */
export async function refreshPending(): Promise<number> {
  try {
    const [ledger, groups] = await Promise.all([pendingCount(), pendingGroupCount()]);
    setState({ pending: ledger + groups, lastSyncAt: (await getMeta<number>(META.lastSyncAt)) ?? null });
  } catch {
    // DB đang đóng (vd. vừa xoá sổ) — lần sau cập nhật.
  }
  return state.pending;
}

async function shouldSyncGroups(): Promise<boolean> {
  if (forceGroups || groupCount === null || groupCount > 0) return true;
  if (Date.now() - lastGroupSyncAt >= IDLE_GROUP_SYNC_MS) return true;
  return (await pendingGroupCount()) > 0;
}

/**
 * Chạy một lượt ngay (nút "Đồng bộ ngay"). Nếu đang chạy thì xếp thêm một lượt sau đó. Không bao giờ ném lỗi.
 * Sổ nợ đồng bộ trước; nhóm chạy sau, lỗi của nhóm không làm hỏng sổ (design D8).
 * `groups: true` (màn Chia tiền) = luôn hỏi server về nhóm, kể cả khi tài khoản chưa có nhóm.
 */
export function syncNow(opts: { groups?: boolean } = {}): Promise<void> {
  if (opts.groups) forceGroups = true;
  if (!started) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setState({ phase: "offline" });
      await refreshPending();
      return;
    }
    setState({ phase: "syncing" });
    let error: unknown = null;
    try {
      await syncOnce(fetchFn);
    } catch (err) {
      error = err;
    }
    // Sổ lỗi mạng/phiên → server cũng không tới được, để lượt thử lại lo cả hai.
    if (error === null && (await shouldSyncGroups())) {
      forceGroups = false;
      try {
        const { syncGroupsOnce } = await import("../groups/sync");
        groupCount = (await syncGroupsOnce(fetchFn)).groupCount;
        lastGroupSyncAt = Date.now();
      } catch (err) {
        error = err;
      }
    }
    try {
      if (error === null) {
        failures = 0;
        setState({ phase: "idle" });
        schedule(INTERVAL_MS);
      } else if (error instanceof SyncAuthError) {
        setState({ phase: "needs_login" });
        stopTimers();
      } else {
        const delay = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
        failures += 1;
        setState({ phase: "error" });
        schedule(delay);
      }
    } finally {
      await refreshPending();
    }
  })().finally(() => {
    running = null;
    if (again && state.phase !== "needs_login") {
      again = false;
      void syncNow();
    }
  });
  return running;
}

function stopTimers() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Bắt đầu đồng bộ nền: ngay lúc gọi, sau thay đổi trên máy, khi có mạng lại, khi quay lại app, và mỗi 60 giây. */
export function start(options: { fetch?: FetchLike } = {}): void {
  if (options.fetch) fetchFn = options.fetch;
  if (started) return;
  started = true;
  failures = 0;
  groupCount = null;
  setState({ phone: readAccountMarker()?.phone ?? state.phone });

  let debounce: ReturnType<typeof setTimeout> | null = null;
  const onMutated = () => {
    if (debounce) clearTimeout(debounce);
    // Chỉ đồng bộ khi thật sự có dòng chờ — ghi của chính lớp đồng bộ không kích hoạt vòng lặp.
    debounce = setTimeout(async () => {
      await refreshPending();
      // Đang lỗi/offline thì để bộ hẹn giờ thử lại (hoặc sự kiện "online") lo, không dồn request.
      if (state.pending > 0 && state.phase !== "needs_login" && state.phase !== "error" && state.phase !== "offline") {
        void syncNow();
      }
    }, DEBOUNCE_MS);
  };
  Dexie.on("storagemutated", onMutated);
  cleanups.push(() => Dexie.on("storagemutated").unsubscribe(onMutated));

  if (typeof window !== "undefined") {
    const onOnline = () => void syncNow();
    const onVisible = () => document.visibilityState === "visible" && void syncNow();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    cleanups.push(() => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    });
  }
  void syncNow();
}

/** Dừng hẳn (đăng xuất). */
export function stop(): void {
  started = false;
  stopTimers();
  cleanups.splice(0).forEach((f) => f());
}

// ---------------------------------------------------------------------------
// Đăng nhập / đăng xuất
// ---------------------------------------------------------------------------

/**
 * Sau khi đăng nhập hoặc xác nhận đăng ký thành công: gắn sổ với tài khoản rồi bắt đầu đồng bộ.
 * `"mismatch"`: máy đang giữ sổ của tài khoản khác → giao diện hỏi xoá sổ hay huỷ (spec cloud-sync).
 */
export async function completeLogin(me: Me, opts: { wipeOtherAccount?: boolean } = {}): Promise<AttachResult> {
  let result = await attachAccount(me);
  if (result === "mismatch") {
    if (!opts.wipeOtherAccount) return result;
    await wipeLocalBook();
    await wipeGroups();
    result = await attachAccount(me);
  }
  writeAccountMarker({ phone: me.phone });
  setState({ phone: me.phone, phase: "idle" });
  stop();
  start();
  return result;
}

/**
 * Đăng xuất. `wipe` = xoá sổ trên máy. Dữ liệu nhóm luôn bị xoá — nhóm gắn với tài khoản (delta user-account).
 * Giao diện đã cảnh báo nếu còn thay đổi chờ gửi sẽ mất.
 */
export async function logout({ wipe }: { wipe: boolean }): Promise<void> {
  stop();
  await accountApi.logout();
  writeAccountMarker(null);
  await wipeGroups();
  if (wipe) await wipeLocalBook();
  setState({ phone: null, phase: "idle", pending: 0, lastSyncAt: null });
}

export { pendingCount, pendingGroupCount };
