import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { resetDbForTests } from "../ledger/db";
import { addDebt } from "../ledger/ledger";
import { getDb, setMeta } from "../ledger/db";
import { createGroup } from "../groups/groups";
import { BACKOFF_MS, logout, start, stop, syncNow, syncStore } from "./index";

// Nạp sẵn module đồng bộ nhóm (lần đầu import() động chậm hơn vòng chờ của test).
beforeAll(async () => {
  await import("../groups/sync");
});

beforeEach(async () => {
  await resetDbForTests();
  await addDebt({ target: { newDebtor: { name: "Chị Lan" } }, amount: 1000 });
});
afterEach(() => {
  stop();
  vi.useRealTimers();
});

/** Chờ việc bất đồng bộ (IndexedDB giả) xong mà không đẩy đồng hồ giả như vi.waitFor. */
async function settle(check: () => boolean = () => false, rounds = 200) {
  for (let i = 0; i < rounds && !check(); i++) await new Promise((r) => setImmediate(r));
}

it("lỗi mạng: thử lại sau 5s, 15s, 60s; dữ liệu chờ vẫn còn", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const fetchFn = vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  });
  start({ fetch: fetchFn });
  await settle(() => syncStore.getState().phase === "error" && syncStore.getState().pending > 0);
  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(syncStore.getState().pending).toBe(2);

  for (const [i, ms] of BACKOFF_MS.entries()) {
    await vi.advanceTimersByTimeAsync(ms - 10);
    await settle(undefined, 20);
    expect(fetchFn).toHaveBeenCalledTimes(i + 1);
    await vi.advanceTimersByTimeAsync(10);
    await settle(() => fetchFn.mock.calls.length === i + 2 && syncStore.getState().phase === "error");
    expect(fetchFn).toHaveBeenCalledTimes(i + 2);
  }
});

it("phiên hết hạn (401): trạng thái cần đăng nhập lại, dừng thử lại", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }));
  start({ fetch: fetchFn });
  await settle(() => syncStore.getState().phase === "needs_login");
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  await syncNow();
  expect(fetchFn).toHaveBeenCalledTimes(2); // lần tự động + lần bấm "Đồng bộ ngay" vẫn báo cần đăng nhập
  expect(syncStore.getState().phase).toBe("needs_login");
  expect(syncStore.getState().pending).toBe(2);
});

const ledgerOk = () =>
  new Response(
    JSON.stringify({ cursor: 1, pull: { debtors: [], transactions: [], debtorEvents: [] }, hasMore: false, rejected: [], serverNow: Date.now() }),
    { status: 200 },
  );
const groupsOk = (groups: string[] = []) =>
  new Response(
    JSON.stringify({ cursors: {}, groups, revoked: [], pull: { groups: [], members: [], expenses: [], events: [] }, hasMore: false, rejected: [], serverNow: Date.now() }),
    { status: 200 },
  );
const calls = (fn: ReturnType<typeof vi.fn>, path: string) => fn.mock.calls.filter(([url]) => String(url).startsWith(path)).length;

it("đồng bộ nhóm lỗi 500: sổ nợ vẫn lên server hết, trạng thái báo lỗi để thử lại", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const fetchFn = vi.fn(async (url: string) => (url.startsWith("/api/groups/") ? new Response("{}", { status: 500 }) : ledgerOk()));
  start({ fetch: fetchFn });
  await settle(() => syncStore.getState().phase === "error" && syncStore.getState().pending === 0);
  expect(calls(fetchFn, "/api/sync/")).toBe(1);
  expect(calls(fetchFn, "/api/groups/sync/")).toBe(1);
  expect(syncStore.getState().pending).toBe(0); // dòng sổ nợ đã gửi xong
});

it("tài khoản không có nhóm: lượt định kỳ không hỏi nhóm, 10 phút mới hỏi lại; màn Chia tiền thì hỏi ngay", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  const fetchFn = vi.fn(async (url: string) => (url.startsWith("/api/groups/") ? groupsOk() : ledgerOk()));
  start({ fetch: fetchFn });
  await settle(() => calls(fetchFn, "/api/groups/sync/") === 1 && syncStore.getState().phase === "idle");

  for (let i = 0; i < 3; i++) {
    await vi.advanceTimersByTimeAsync(60_000);
    await settle(() => calls(fetchFn, "/api/sync/") === i + 2 && syncStore.getState().phase === "idle");
  }
  expect(calls(fetchFn, "/api/sync/")).toBe(4);
  expect(calls(fetchFn, "/api/groups/sync/")).toBe(1);

  await syncNow({ groups: true });
  await settle(() => calls(fetchFn, "/api/groups/sync/") === 2 && syncStore.getState().phase === "idle");
  expect([syncStore.getState().phase, calls(fetchFn, "/api/sync/")]).toEqual(["idle", 5]);
  expect(calls(fetchFn, "/api/groups/sync/")).toBe(2);

  await vi.advanceTimersByTimeAsync(10 * 60_000);
  await settle(() => calls(fetchFn, "/api/groups/sync/") === 3);
  expect(calls(fetchFn, "/api/groups/sync/")).toBe(3);
});

it("đăng xuất giữ sổ: nhóm luôn bị xoá khỏi máy, sổ nợ còn nguyên", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  await setMeta("accountUserId", "user-a");
  await createGroup({ name: "Đà Lạt", selfName: "An" });
  await logout({ wipe: false });
  vi.unstubAllGlobals();
  expect(await getDb().groups.count()).toBe(0);
  expect(await getDb().groupEvents.count()).toBe(0);
  expect(await getDb().debtors.count()).toBe(1);
});
