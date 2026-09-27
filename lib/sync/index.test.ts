import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetDbForTests } from "../ledger/db";
import { addDebt } from "../ledger/ledger";
import { BACKOFF_MS, start, stop, syncNow, syncStore } from "./index";

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
