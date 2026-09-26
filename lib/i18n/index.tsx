"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en } from "./en";
import { vi, type Dict } from "./vi";

export type Lang = "vi" | "en";
export type TKey = keyof Dict;

const DICTS: Record<Lang, Dict> = { vi, en };
export const LANG_STORAGE_KEY = "so-no.lang";

export function readStoredLang(): Lang {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) === "en" ? "en" : "vi";
  } catch {
    return "vi";
  }
}

export function translate(lang: Lang, key: TKey, params?: Record<string, string | number>): string {
  let text = DICTS[lang][key];
  if (params) {
    for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
  }
  return text;
}

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // HTML tĩnh luôn render tiếng Việt; ngôn ngữ đã lưu được áp dụng ngay sau khi hydrate.
  const [lang, setLangState] = useState<Lang>("vi");

  useEffect(() => {
    const stored = readStoredLang();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chỉ đọc được localStorage sau hydrate
    if (stored !== "vi") setLangState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {}
    // Bản sao trong IndexedDB để đi cùng dữ liệu (sao lưu/đồng bộ bản sau); tải lười cho nhẹ.
    import("../ledger/db").then(({ setMeta }) => setMeta("lang", next)).catch(() => {});
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (key, params) => translate(lang, key, params) }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
