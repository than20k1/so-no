"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccountT } from "@/lib/i18n/account";
import { formatPhone } from "@/lib/phone";
import type { Me } from "@/lib/sync/account";
import { accountApi } from "@/lib/sync/api";
import { useToast } from "../Toast";

/**
 * Sau khi có phiên: gắn sổ trên máy với tài khoản, bắt đầu đồng bộ, về màn chính.
 * Nếu máy đang giữ sổ của tài khoản khác thì hiện hộp thoại chọn xoá sổ trên máy hoặc huỷ (spec cloud-sync).
 */
export function useFinishLogin() {
  const t = useAccountT();
  const router = useRouter();
  const toast = useToast();
  const [mismatch, setMismatch] = useState<Me | null>(null);

  async function finish(me: Me, wipeOtherAccount = false) {
    const { completeLogin } = await import("@/lib/sync");
    const result = await completeLogin(me, { wipeOtherAccount });
    if (result === "mismatch") return setMismatch(me);
    router.replace("/");
    toast({ message: t("loggedIn") });
  }

  const dialog = mismatch && (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      role="dialog"
      aria-modal="true"
      data-testid="mismatch-dialog"
    >
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3 rounded-t-3xl bg-surface p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <h2 className="text-lg font-bold">{t("mismatchTitle")}</h2>
        <p className="text-sm">{t("mismatchBody", { phone: formatPhone(mismatch.phone) })}</p>
        <button
          type="button"
          onClick={() => finish(mismatch, true)}
          className="min-h-12 rounded-2xl bg-add font-bold text-white active:bg-add-press"
        >
          {t("mismatchWipe")}
        </button>
        <button
          type="button"
          onClick={async () => {
            await accountApi.logout();
            setMismatch(null);
          }}
          className="min-h-12 rounded-2xl border border-line font-semibold"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );

  return { finish, dialog };
}
