"use client";

import { useEffect, type ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import { initInstallCapture } from "@/lib/install";
import { getContext } from "@/lib/ledger/db";
import { purgeExpired } from "@/lib/ledger/debtors";
import { useTrackNavigation } from "@/lib/nav";
import { readAccountMarker } from "@/lib/sync/marker";
import { ToastProvider } from "./Toast";

initInstallCapture();

function registerServiceWorker() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
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

  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}
