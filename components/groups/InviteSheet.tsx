"use client";

import { useEffect, useState } from "react";
import { groupApi, inviteUrl } from "@/lib/groups/api";
import type { GroupView } from "@/lib/groups/view";
import { groupErrorKey, useGroupsT } from "@/lib/i18n/groups";
import { useToast } from "../Toast";
import { dangerBtn, ErrorText, GROUP_PATH, primaryBtn, secondaryBtn, Sheet } from "./ui";

/** Lấy link mời — nhóm vừa tạo offline thì đồng bộ lên server trước (spec "Link mời"). */
async function fetchToken(groupId: string, dirty: boolean) {
  const api = groupApi();
  const { syncNow } = await import("@/lib/sync");
  if (dirty) await syncNow({ groups: true });
  let res = await api.invite(groupId);
  if (!res.ok && res.error === "not_found") {
    await syncNow({ groups: true });
    res = await api.invite(groupId);
  }
  return res;
}

export default function InviteSheet({ group: g, onClose }: { group: GroupView; onClose: () => void }) {
  const t = useGroupsT();
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const groupId = g.group.id;
  const dirty = g.group._dirty === 1;

  useEffect(() => {
    let alive = true;
    void fetchToken(groupId, dirty).then((res) => {
      if (!alive) return;
      if (res.ok) setUrl(inviteUrl(res.token));
      else setError(t(groupErrorKey(res.error)));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ lấy link một lần khi mở bảng
  }, [groupId]);

  async function share() {
    if (!url) return;
    const text = t("inviteText", { name: g.group.name });
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: g.group.name, text, url });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast({ message: t("linkCopied"), showOn: GROUP_PATH });
    } catch {
      setError(url);
    }
  }

  async function showQr() {
    if (!url) return;
    const { default: qrcode } = await import("qrcode-generator");
    const code = qrcode(0, "M");
    code.addData(url);
    code.make();
    setQr(code.createSvgTag({ cellSize: 6, margin: 2, scalable: true }));
  }

  async function reset() {
    const res = await groupApi().resetInvite(groupId);
    setConfirmReset(false);
    if (!res.ok) return setError(t(groupErrorKey(res.error)));
    setUrl(inviteUrl(res.token));
    setQr(null);
    toast({ message: t("linkReset"), showOn: GROUP_PATH });
  }

  return (
    <Sheet label={t("invite")} onClose={onClose}>
      <h2 className="text-lg font-bold">{t("invite")}</h2>
      {url ? (
        <p className="rounded-xl bg-line/60 p-3 text-sm break-all" data-testid="invite-url">
          {url}
        </p>
      ) : (
        !error && <p className="text-muted">{t("loading")}</p>
      )}
      <ErrorText>{error}</ErrorText>
      {qr && (
        // SVG do thư viện sinh từ chính link của mình — không có dữ liệu người khác nhập.
        <div className="mx-auto w-64 rounded-xl bg-white p-2" data-testid="invite-qr" dangerouslySetInnerHTML={{ __html: qr }} />
      )}
      <button type="button" disabled={!url} onClick={share} className={primaryBtn}>
        {t("invite")}
      </button>
      {!qr && (
        <button type="button" disabled={!url} onClick={showQr} className={secondaryBtn}>
          {t("showQr")}
        </button>
      )}
      {g.isCreator &&
        (confirmReset ? (
          <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
            <p className="text-sm">{t("resetLinkConfirm")}</p>
            <div className="flex gap-2">
              <button type="button" className={`${secondaryBtn} flex-1`} onClick={() => setConfirmReset(false)}>
                {t("cancel")}
              </button>
              <button type="button" className={`${dangerBtn} flex-1`} onClick={reset}>
                {t("resetLink")}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={!url} onClick={() => setConfirmReset(true)} className={dangerBtn}>
            {t("resetLink")}
          </button>
        ))}
      <button type="button" onClick={onClose} className="min-h-11 text-sm text-muted">
        {t("close")}
      </button>
    </Sheet>
  );
}
