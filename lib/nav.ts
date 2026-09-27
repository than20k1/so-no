"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

let inAppNavigations = 0;

/** Đếm số lần chuyển trang trong app (không tính lần mở đầu) để biết "quay lại" có an toàn không. */
export function useTrackNavigation() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    inAppNavigations += 1;
  }, [pathname]);
}

export function hasInAppHistory(): boolean {
  return inAppNavigations > 0;
}

const noopSubscribe = () => () => {};

/**
 * Đọc một tham số trên URL mà không cần `useSearchParams` — nhờ vậy trang vẫn được
 * prerender thành HTML tĩnh (không phải bọc Suspense); giá trị có ngay sau khi hydrate.
 */
export function useQueryParam(name: string): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}

/**
 * Trang quay lại sau khi đăng nhập (`?next=`). Chỉ nhận đường dẫn trong app ("/..."), không nhận
 * "//host" hay "/\\host" (trình duyệt hiểu là trang khác) — chống chuyển hướng ra ngoài.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

/** Giữ `?next=` khi chuyển giữa các màn đăng nhập / đăng ký. */
export function withNext(href: string, next: string | null): string {
  return next && safeNext(next) !== "/" ? `${href}?next=${encodeURIComponent(next)}` : href;
}
