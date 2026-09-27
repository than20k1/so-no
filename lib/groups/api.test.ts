import { afterEach, expect, it, vi } from "vitest";
import { groupApi, inviteUrl } from "./api";

afterEach(() => vi.restoreAllMocks());

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

it("gọi đúng đường dẫn, gửi JSON, trả kết quả", async () => {
  const f = reply(200, { token: "abc" });
  expect(await groupApi(f).invite("g1")).toEqual({ ok: true, token: "abc" });
  expect(f).toHaveBeenCalledWith("/api/groups/g1/invite/", expect.objectContaining({ method: "POST", body: "{}" }));
  const j = reply(200, { groupId: "g1", memberId: "m1" });
  await groupApi(j).join("tok", { memberId: "m1" });
  expect(JSON.parse(String((j.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ token: "tok", memberId: "m1" });
});

it("lỗi server có mã: trả mã lỗi và số dư khi chưa trả hết", async () => {
  expect(await groupApi(reply(409, { error: "not_settled", balance: -50000 })).leave("g1")).toEqual({ ok: false, error: "not_settled", balance: -50000 });
  expect(await groupApi(reply(500, {})).leave("g1")).toMatchObject({ ok: false, error: "server" });
});

it("mất mạng: báo offline, không gọi server", async () => {
  const f = reply(200, {});
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  expect(await groupApi(f).preview("t")).toEqual({ ok: false, error: "offline" });
  expect(f).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  const failing = vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  });
  expect(await groupApi(failing).preview("t")).toEqual({ ok: false, error: "offline" });
});

it("link mời đặt token sau dấu #", () => {
  expect(inviteUrl("abc", "https://x.app")).toBe("https://x.app/chia-tien/tham-gia/#abc");
});
