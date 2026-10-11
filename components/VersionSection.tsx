"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { checkForUpdate, getVersion, type CheckResult } from "@/lib/update-sw";

/** Mục cuối menu: mã phiên bản đang chạy và nút "Kiểm tra bản mới" (spec offline-app-shell). */
export function VersionSection({ itemClass }: { itemClass: string }) {
  const { t } = useI18n();
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  useEffect(() => {
    let alive = true;
    void getVersion().then((v) => alive && setVersion(v));
    return () => {
      alive = false;
    };
  }, []);

  async function check() {
    setChecking(true);
    setResult(null);
    const r = await checkForUpdate();
    setChecking(false);
    setResult(r);
  }

  return (
    <>
      <button type="button" className={itemClass} onClick={check} disabled={checking} data-testid="check-update">
        {checking ? t("checkingUpdate") : t("checkUpdate")}
      </button>
      {result && result !== "available" && (
        <p className="px-3 text-sm text-muted" aria-live="polite" data-testid="update-result">
          {t(result === "latest" ? "updateLatest" : "updateOffline")}
        </p>
      )}
      {result === "available" && (
        <p className="px-3 text-sm font-medium" data-testid="update-result">
          {t("updateAvailable")}
        </p>
      )}
      <p className="px-3 pt-1 pb-2 text-xs text-muted" data-testid="app-version">
        {t("appVersion", { version: version ?? "dev" })}
      </p>
    </>
  );
}
