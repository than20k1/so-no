"use client";

import dynamic from "next/dynamic";
import { useEffect, type ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import { initInstallCapture } from "@/lib/install";
import { getContext } from "@/lib/ledger/db";
import { purgeExpired } from "@/lib/ledger/debtors";
import { useTrackNavigation } from "@/lib/nav";
import { readAccountMarker } from "@/lib/sync/marker";
import { useUpdateState } from "@/lib/update";
import { ToastProvider } from "./Toast";

// Chỉ tải khi thật sự có bản mới — giữ gói JS màn chính trong ngân sách (spec offline-app-shell).
const UpdateBar = dynamic(() => import("./UpdateBar").then((m) => m.UpdateBar), { ssr: false });

initInstallCapture();

/** Đăng ký service worker và theo dõi bản mới (lib/update-sw.ts, tải lười). */
export function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  const register = () => void import("@/lib/update-sw").then((m) => m.initUpdates()).catch(() => {});
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(registerServiceWorker, []);
  // Tạo sổ mặc định + mã thiết bị ở lần mở đầu (ghi DB nên không làm trong truy vấn live),
  // rồi tự xoá hẳn người đã nằm thùng rác đủ 30 ngày (spec debtor-management).
  useEffect(() => {
    getContext()
      .then(() => purgeExpired())
      .catch(() => {});
  }, []);
  // Đã đăng nhập → tải lười bộ đồng bộ khi trình duyệt rảnh; chưa đăng nhập thì không tải gì (design D11).
  useEffect(() => {
    if (!readAccountMarker()) return;
    const load = () => void import("@/lib/sync").then((m) => m.start());
    if ("requestIdleCallback" in window) requestIdleCallback(load, { timeout: 3000 });
    else setTimeout(load, 1000);
  }, []);
  useTrackNavigation();
  const update = useUpdateState();

  return (
    <I18nProvider>
      <ToastProvider>
        {(update.waiting || update.stale) && <UpdateBar />}
        {children}
      </ToastProvider>
    </I18nProvider>
  );
}
