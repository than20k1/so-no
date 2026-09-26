"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { hasInAppHistory } from "@/lib/nav";
import { BackIcon } from "./icons";

/** Quay lại màn trước nếu vào từ trong app, ngược lại về màn chính. */
export function useGoBack() {
  const router = useRouter();
  return () => {
    if (hasInAppHistory()) router.back();
    else router.replace("/");
  };
}

export function PageHeader({ title }: { title: string }) {
  const { t } = useI18n();
  const goBack = useGoBack();
  return (
    <header className="flex items-center gap-1 px-2 pt-[max(8px,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={goBack}
        aria-label={t("back")}
        className="grid size-12 place-items-center rounded-full active:bg-line"
      >
        <BackIcon />
      </button>
      <h1 className="truncate text-xl font-bold">{title}</h1>
    </header>
  );
}
