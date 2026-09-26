"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { BackupFile, ImportPreview } from "@/lib/ledger/backup";
import { useToast } from "./Toast";

export interface PendingImport {
  data: BackupFile;
  preview: ImportPreview;
}

export function useBackupActions() {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, setPending] = useState<PendingImport | null>(null);

  async function exportNow() {
    try {
      const [{ backupFileName, buildBackup, markBackedUp }, { shareOrDownload }] = await Promise.all([
        import("@/lib/ledger/backup"),
        import("@/lib/share"),
      ]);
      const data = await buildBackup();
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const outcome = await shareOrDownload(blob, backupFileName());
      if (outcome === "cancelled") return;
      await markBackedUp();
      toast({ message: t("exportDone") });
    } catch {
      toast({ message: t("exportFailed") });
    }
  }

  /** Bước 1: đọc và kiểm tra file, hiện tóm tắt để người dùng xác nhận. */
  async function pickFile(file: File) {
    const { parseBackup, previewBackupImport } = await import("@/lib/ledger/backup");
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      toast({ message: t("importInvalid") });
      return;
    }
    const preview = await previewBackupImport(parsed.data);
    if (preview.orphans > 0) {
      toast({ message: t("importInvalid") });
      return;
    }
    setPending({ data: parsed.data, preview });
  }

  /** Bước 2: người dùng đã xác nhận. */
  async function confirmImport() {
    if (!pending) return;
    try {
      const { applyBackupImport } = await import("@/lib/ledger/backup");
      await applyBackupImport(pending.data);
      toast({ message: t("importDone") });
    } catch {
      toast({ message: t("importInvalid") });
    } finally {
      setPending(null);
    }
  }

  return { exportNow, pickFile, pending, confirmImport, cancelImport: () => setPending(null) };
}
