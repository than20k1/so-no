"use client";

// Trạng thái cập nhật phiên bản app (spec offline-app-shell, design sua-cap-nhat-phien-ban D3).
// File này nằm trong gói JS của màn chính nên giữ thật nhỏ; phần làm việc với service worker
// ở `update-sw.ts`, được tải lười sau khi trang mở xong.
import { useEffect, useSyncExternalStore } from "react";

export interface UpdateState {
  /** Bản mới đã tải xong, đang chờ được bật. */
  waiting: boolean;
  /** Bản mới đã được bật ở tab khác — trang này đang chạy bản cũ, cần tải lại. */
  stale: boolean;
  /** Màn đang hiện cho phép tự tải lại (không có form/hộp thoại mở). */
  safe: boolean;
}

const INITIAL: UpdateState = { waiting: false, stale: false, safe: false };
let state: UpdateState = INITIAL;
const listeners = new Set<() => void>();
/**
 * Vừa mở app, vừa quay lại từ nền, hoặc vừa vào một màn chính, và người dùng chưa chạm gì từ lúc đó —
 * lúc duy nhất được tự tải lại.
 */
let opportunity = false;
/** Số thứ đang tạm giữ không cho tự tải lại (vd. toast "Hoàn tác" đang hiện). */
let holds = 0;
/** Bật bản mới — do `update-sw.ts` gắn vào khi đã đăng ký service worker. */
let applier: (() => void) | null = null;

export function setUpdateState(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const updateStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getState: () => state,
};

export function setApplier(fn: (() => void) | null): void {
  applier = fn;
}

export function setOpportunity(value: boolean): void {
  opportunity = value;
}

export function canAutoApply(): boolean {
  return opportunity && state.safe && holds === 0;
}

export function maybeAutoApply(): void {
  if (canAutoApply() && (state.waiting || state.stale)) applyUpdate();
}

/** Bật bản mới rồi tải lại trang (nút "Cập nhật", hoặc tự gọi ở màn an toàn). */
export function applyUpdate(): void {
  applier?.();
}

/** Màn hiện tại cho phép tự tải lại hay không. Trả hàm huỷ (đặt lại về không an toàn). */
export function setSafe(safe: boolean): () => void {
  setUpdateState({ safe });
  if (safe) maybeAutoApply();
  return () => setUpdateState({ safe: false });
}

/** Vừa vào một màn chính: coi như thời điểm được tự áp dụng bản mới (chuyển màn không giữ lẫn hai bản). */
export function markArrival(): void {
  opportunity = true;
  maybeAutoApply();
}

/** Tạm giữ không cho tự tải lại; trả hàm nhả. Nhả xong mà vẫn đủ điều kiện thì áp dụng ngay. */
export function holdUpdates(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    maybeAutoApply();
  };
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(updateStore.subscribe, updateStore.getState, () => INITIAL);
}

/** Màn chính khai báo lúc nào an toàn để tự áp dụng bản mới (design D3). */
export function useSafeToUpdate(safe: boolean): void {
  useEffect(() => setSafe(safe), [safe]);
  // Chạy sau effect trên, nên trạng thái an toàn đã được khai báo khi đánh dấu vừa vào màn.
  useEffect(markArrival, []);
}

/** Chỉ dùng trong test. */
export function resetUpdateStateForTests(): void {
  state = INITIAL;
  opportunity = false;
  holds = 0;
  applier = null;
}
