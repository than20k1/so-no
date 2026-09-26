"use client";

import { useEffect, useState } from "react";

const MENU_HASH = "#menu";

/**
 * Menu phụ gắn với lịch sử trình duyệt: mở = thêm `#menu`, nên nút quay lại
 * của điện thoại đóng menu thay vì rời màn chính.
 */
export function useMenuState() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onPop = () => setOpen(window.location.hash === MENU_HASH);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return {
    open,
    show() {
      if (window.location.hash !== MENU_HASH) window.history.pushState(window.history.state, "", MENU_HASH);
      setOpen(true);
    },
    close() {
      if (window.location.hash === MENU_HASH) window.history.back();
      else setOpen(false);
    },
  };
}
