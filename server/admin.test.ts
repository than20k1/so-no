// @vitest-environment node
import { expect, it, vi } from "vitest";
import { adminRestore } from "./admin";
import type { SyncDebtor, SyncResponse } from "./sync";
import { createHarness } from "./test/harness";

it("admin khôi phục người đã xoá hẳn; lượt kéo sau của khách thấy lại, kèm sự kiện restore từ admin", async () => {
  const h = await createHarness();
  const c = h.client();
  await c.post("/api/account/register", { phone: "0912345678", email: "lan@example.com", password: "123456", confirmPassword: "123456" });
  await c.post("/api/account/verify", { email: "lan@example.com", otp: h.mailer.lastOtp("lan@example.com") });

  const now = Date.now();
  const tu: SyncDebtor = {
    id: crypto.randomUUID(), bookId: "x", name: "Anh Tú", note: "cá", searchKey: "anh tu",
    createdAt: now - 60 * 86400000, updatedAt: now, deletedAt: now - 40 * 86400000, purgedAt: now - 5 * 86400000,
  };
  const first = (await c.post("/api/sync", { cursor: 0, push: { debtors: [tu], transactions: [], debtorEvents: [] } })).body as SyncResponse;
  expect(first.pull.debtors[0].purgedAt).not.toBeNull();

  const dry = await adminRestore(h.db, "+84 912 345 678", "tu", false);
  expect(dry).toEqual({ matches: [expect.objectContaining({ id: tu.id, name: "Anh Tú" })], restored: 0 });
  expect((await c.post("/api/sync", { cursor: first.cursor, push: {} })).body.pull.debtors).toEqual([]);

  vi.useFakeTimers({ toFake: ["Date"] });
  expect((await adminRestore(h.db, "0912345678", "tu", true)).restored).toBe(1);
  vi.useRealTimers();

  const next = (await c.post("/api/sync", { cursor: first.cursor, push: {} })).body as SyncResponse;
  expect(next.pull.debtors[0]).toMatchObject({ id: tu.id, deletedAt: null, purgedAt: null });
  expect(next.pull.debtorEvents).toEqual([expect.objectContaining({ kind: "restore", deviceId: "admin" })]);
});
