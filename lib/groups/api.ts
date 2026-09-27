// Gọi API nhóm không đi qua đồng bộ (/api/groups/*): link mời, vào / rời nhóm, xoá / khôi phục (design D6).

export type GroupApiError =
  | "unauthorized"
  | "invalid"
  | "not_found"
  | "forbidden"
  | "invalid_link"
  | "taken"
  | "name_taken"
  | "limit"
  | "not_settled"
  | "too_many_attempts"
  | "offline"
  | "server";

export type GroupApiResult<T> = ({ ok: true } & T) | { ok: false; error: GroupApiError; balance?: number };

export interface JoinPreview {
  groupId: string;
  name: string;
  alreadyMember: boolean;
  members: { id: string; name: string; weight: number; linked: boolean }[];
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

async function call<T>(path: string, body: unknown = {}, fetchFn: FetchLike = (i, init) => fetch(i, init)): Promise<GroupApiResult<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, error: "offline" };
  let res: Response;
  try {
    res = await fetchFn(`/api/groups/${path}/`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "offline" };
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, ...(data as T) };
  return { ok: false, error: (data.error as GroupApiError) ?? "server", balance: data.balance };
}

const enc = encodeURIComponent;

export function groupApi(fetchFn?: FetchLike) {
  return {
    invite: (groupId: string) => call<{ token: string }>(`${enc(groupId)}/invite`, {}, fetchFn),
    resetInvite: (groupId: string) => call<{ token: string }>(`${enc(groupId)}/invite/reset`, {}, fetchFn),
    preview: (token: string) => call<JoinPreview>("join/preview", { token }, fetchFn),
    join: (token: string, as: { memberId: string } | { name: string }) =>
      call<{ groupId: string; memberId: string }>("join", { token, ...as }, fetchFn),
    leave: (groupId: string) => call<object>(`${enc(groupId)}/leave`, {}, fetchFn),
    remove: (groupId: string) => call<object>(`${enc(groupId)}/delete`, {}, fetchFn),
    restore: (groupId: string) => call<object>(`${enc(groupId)}/restore`, {}, fetchFn),
  };
}

/** Link mời: token nằm sau `#` để không lọt vào log server/CDN (design D6). */
export function inviteUrl(token: string, origin = typeof location !== "undefined" ? location.origin : ""): string {
  return `${origin}/chia-tien/tham-gia/#${token}`;
}
