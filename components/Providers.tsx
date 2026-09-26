"use client";

import { useEffect, type ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import { initInstallCapture } from "@/lib/install";
import { getContext } from "@/lib/ledger/db";
import { useTrackNavigation } from "@/lib/nav";
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
  // Tạo sổ mặc định + mã thiết bị ở lần mở đầu (ghi DB nên không làm trong truy vấn live).
  useEffect(() => {
    getContext().catch(() => {});
  }, []);
  useTrackNavigation();

  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}
