"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { groupApi, type JoinPreview } from "@/lib/groups/api";
import { SELF_NAME_META } from "@/lib/groups/groups";
import { groupErrorKey, useGroupsT } from "@/lib/i18n/groups";
import { getMeta, setMeta } from "@/lib/ledger/db";
import { PageHeader } from "../PageHeader";
import { useLoggedIn } from "./GroupsScreen";
import { card, ErrorText, input, primaryBtn } from "./ui";

const TOKEN_KEY = "so-no.joinToken";
const JOIN_PATH = "/chia-tien/tham-gia/";

/**
 * Token nằm sau `#` của link mời. Giữ lại trong sessionStorage vì phải đi qua màn đăng nhập
 * (phần `#…` mất khi chuyển trang), rồi xoá khỏi thanh địa chỉ.
 */
function takeToken(): string | null {
  try {
    const fromHash = window.location.hash.slice(1);
    if (fromHash) {
      sessionStorage.setItem(TOKEN_KEY, fromHash);
      window.history.replaceState(window.history.state, "", window.location.pathname);
      return fromHash;
    }
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return window.location.hash.slice(1) || null;
  }
}

async function openGroup(router: ReturnType<typeof useRouter>, groupId: string) {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
  const { syncNow } = await import("@/lib/sync");
  await syncNow({ groups: true });
  router.replace(`/chia-tien/nhom/?id=${groupId}`);
}

export function JoinScreen() {
  const t = useGroupsT();
  const router = useRouter();
  const loggedIn = useLoggedIn();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | "new" | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastSelf = useLiveQuery(async () => (await getMeta<string>(SELF_NAME_META)) ?? "", []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- location/sessionStorage chỉ đọc được sau hydrate
    setToken(takeToken());
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await groupApi().preview(token);
    if (!res.ok) return setError(t(groupErrorKey(res.error)));
    if (res.alreadyMember) return openGroup(router, res.groupId);
    setPreview(res);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t đổi theo ngôn ngữ, không cần tải lại
  }, [token, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tải xem trước từ server
    if (loggedIn && token) void load();
  }, [loggedIn, token, load]);

  async function join(e: FormEvent) {
    e.preventDefault();
    if (!token || !choice || busy) return;
    setBusy(true);
    setError(null);
    const newName = (name ?? lastSelf ?? "").trim();
    const res = await groupApi().join(token, choice === "new" ? { name: newName } : { memberId: choice });
    if (!res.ok) {
      setBusy(false);
      setError(t(groupErrorKey(res.error)));
      if (res.error === "taken") {
        setChoice(null);
        void load();
      }
      return;
    }
    if (choice === "new") await setMeta(SELF_NAME_META, newName);
    await openGroup(router, res.groupId);
  }

  const guests = preview?.members.filter((m) => !m.linked) ?? [];

  return (
    <>
      <PageHeader title={t("joinTitle")} />
      <main className="flex flex-1 flex-col gap-4 px-4 pt-2 pb-10">
        {token === null ? (
          <ErrorText>{t("errInvalidLink")}</ErrorText>
        ) : !loggedIn ? (
          <section className={`${card} flex flex-col gap-3 p-5 text-center`} data-testid="join-login">
            <p>{t("joinLogin")}</p>
            <Link href={`/dang-nhap/?next=${encodeURIComponent(JOIN_PATH)}`} className={`${primaryBtn} grid place-items-center`}>
              {t("splitLogin")}
            </Link>
          </section>
        ) : !preview ? (
          error ? <ErrorText>{error}</ErrorText> : <p className="p-4 text-center text-muted">{t("loading")}</p>
        ) : (
          <form onSubmit={join} className="flex flex-col gap-3" data-testid="join-form">
            <h1 className="text-xl font-bold">{t("joinWho", { name: preview.name })}</h1>
            <ul className={`${card} overflow-hidden`}>
              {guests.map((m) => (
                <li key={m.id} className="border-b border-line last:border-b-0">
                  <label className="flex min-h-14 items-center gap-3 px-4">
                    <input type="radio" name="who" checked={choice === m.id} onChange={() => setChoice(m.id)} className="size-5 accent-foreground" />
                    <span className="text-[16px] font-medium">{t("iAm", { name: m.name })}</span>
                  </label>
                </li>
              ))}
              <li>
                <label className="flex min-h-14 items-center gap-3 px-4">
                  <input type="radio" name="who" checked={choice === "new"} onChange={() => setChoice("new")} className="size-5 accent-foreground" />
                  <span className="text-[16px] font-medium">{t("iAmNew")}</span>
                </label>
              </li>
            </ul>
            {choice === "new" && (
              <input
                autoFocus
                value={name ?? lastSelf ?? ""}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("yourNamePlaceholder")}
                aria-label={t("yourName")}
                maxLength={200}
                className={input}
              />
            )}
            <ErrorText>{error}</ErrorText>
            <button type="submit" disabled={!choice || busy || (choice === "new" && !(name ?? lastSelf ?? "").trim())} className={primaryBtn}>
              {busy ? t("joining") : t("join")}
            </button>
          </form>
        )}
      </main>
    </>
  );
}
