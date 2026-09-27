"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export const TOAST_DURATION_MS = 6000;

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
  /** Trang mà toast được phép hiện (mặc định màn chính "/"); chuyển sang trang khác thì toast đóng. */
  showOn?: string;
}

interface ToastState extends ToastOptions {
  id: number;
}

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);

  const show = useCallback((options: ToastOptions) => {
    nextId.current += 1;
    setToast({ ...options, id: nextId.current });
  }, []);

  // Rời trang của toast (vd. từ màn chính mở form ghi nợ mới) → đóng toast cũ để không che nút Lưu.
  // Toast được bật ngay trước khi chuyển tới trang của nó, nên chỉ đóng khi đang ở trang khác trang đó.
  const pathname = usePathname();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- đồng bộ với URL thay đổi
    setToast((cur) => (cur && pathname !== (cur.showOn ?? "/") ? null : cur));
  }, [pathname]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.duration ?? TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-[480px] justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))]"
      >
        {toast && (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl bg-foreground px-4 py-3 text-background shadow-lg"
          >
            <span className="flex-1 text-[15px] leading-snug">{toast.message}</span>
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={() => {
                  const action = toast.onAction;
                  setToast(null);
                  action?.();
                }}
                className="min-h-11 shrink-0 rounded-xl px-3 text-[15px] font-semibold text-amber-300 active:bg-white/10 dark:text-amber-700 dark:active:bg-black/10"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside ToastProvider");
  return show;
}
