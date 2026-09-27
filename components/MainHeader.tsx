"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import type { AppMode } from "@/lib/mode";
import { MenuIcon } from "./icons";
import { useInstallHint } from "./InstallHint";
import { ModeSwitch } from "./ModeSwitch";
import { useMenuState } from "./useMenuState";

// Menu ít dùng → tải lười cho màn chính nhẹ; service worker vẫn precache nên mở được khi offline.
const Menu = dynamic(() => import("./Menu"), { ssr: false });

/** Header của hai màn chính (Ghi nợ, Chia tiền): nút menu `[=]`, công tắc chế độ, và phần tóm tắt bên phải. */
export function MainHeader({ mode, children }: { mode: AppMode; children?: ReactNode }) {
  const { t } = useI18n();
  const menu = useMenuState();
  // Menu chỉ được nạp ở lần mở đầu, sau đó giữ lại để có hiệu ứng đóng/mở.
  const [menuLoaded, setMenuLoaded] = useState(false);
  const installHint = useInstallHint();

  return (
    <>
      <header className="flex items-center gap-1.5 px-2 pt-[max(8px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            setMenuLoaded(true);
            menu.show();
          }}
          aria-label={t("menu")}
          aria-expanded={menu.open}
          className="relative grid size-12 shrink-0 place-items-center rounded-full active:bg-line"
        >
          <MenuIcon />
          {/* Chấm báo: trong menu có gợi ý cài app chưa xem */}
          {installHint.visible && (
            <span className="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-add ring-2 ring-background" data-testid="menu-dot" />
          )}
        </button>
        <ModeSwitch current={mode} />
        <div className="ml-auto min-w-0 pr-2 text-right">{children}</div>
      </header>
      {menuLoaded && <Menu open={menu.open} onClose={menu.close} />}
    </>
  );
}
