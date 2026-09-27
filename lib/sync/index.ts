// Điều phối đồng bộ trên trình duyệt (design D11). Chỉ được tải khi máy đã đăng nhập hoặc khi mở màn tài khoản.
import Dexie from "dexie";
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
const cleanups: (() => void)[] = [];

function schedule(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

/** Cập nhật số dòng chờ gửi và lần đồng bộ gần nhất trong trạng thái (vd. khi mở menu). */
export async function refreshPending(): Promise<number> {
  try {
    setState({ pending: await pendingCount(), lastSyncAt: (await getMeta<number>(META.lastSyncAt)) ?? null });
  } catch {
    // DB đang đóng (vd. vừa xoá sổ) — lần sau cập nhật.
  }
  return state.pending;
}

/** Chạy một lượt ngay (nút "Đồng bộ ngay"). Nếu đang chạy thì xếp thêm một lượt sau đó. Không bao giờ ném lỗi. */
export function syncNow(): Promise<void> {
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
    try {
      await syncOnce(fetchFn);
      failures = 0;
      setState({ phase: "idle" });
      schedule(INTERVAL_MS);
    } catch (err) {
      if (err instanceof SyncAuthError) {
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
    result = await attachAccount(me);
  }
  writeAccountMarker({ phone: me.phone });
  setState({ phone: me.phone, phase: "idle" });
  stop();
  start();
  return result;
}

/** Đăng xuất. `wipe` = xoá sổ trên máy (giao diện đã cảnh báo nếu còn thay đổi chờ gửi). */
export async function logout({ wipe }: { wipe: boolean }): Promise<void> {
  stop();
  await accountApi.logout();
  writeAccountMarker(null);
  if (wipe) await wipeLocalBook();
  setState({ phone: null, phase: "idle", pending: 0, lastSyncAt: null });
}

export { pendingCount };
