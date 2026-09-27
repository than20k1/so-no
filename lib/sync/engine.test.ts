// @vitest-environment node
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHarness, type TestClient } from "../../server/test/harness";
import { getDb, switchDbForTests } from "../ledger/db";
import { deleteDebtor, editDebtor, listTrash, purgeDebtor } from "../ledger/debtors";
import { addDebt, getDebtor, listDebtors, payDebt } from "../ledger/ledger";
import { attachAccount, wipeLocalBook, type Me } from "./account";
import { pendingCount, syncOnce, SyncAuthError } from "./engine";

let h: Awaited<ReturnType<typeof createHarness>>;
const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  h = await createHarness();
  for (const n of ["A", "B", "C"]) await Dexie.delete(n);
});
afterEach(() => getDb().close());

/** Một "điện thoại": DB riêng + cookie riêng, cùng đăng nhập một tài khoản. */
interface Device {
  name: string;
  client: TestClient;
  me: Me;
}

async function signUp(phone = "0912345678", email = "lan@example.com") {
  const c = h.client();
  await c.post("/api/account/register", { phone, email, password: "123456", confirmPassword: "123456" });
  await c.post("/api/account/verify", { email, otp: h.mailer.lastOtp(email) });
}

async function device(name: string, phone = "0912345678"): Promise<Device> {
  const client = h.client();
  const res = await client.post("/api/account/login", { phone, password: "123456" });
  return { name, client, me: res.body as Me };
}

async function on<T>(dev: Device, fn: () => Promise<T>): Promise<T> {
  switchDbForTests(dev.name);
  return fn();
}
const sync = (dev: Device) => on(dev, () => syncOnce(dev.client.fetch));
const balances = async () => Object.fromEntries((await listDebtors()).map((d) => [d.name, d.balance]));

describe("đồng bộ nhiều máy", () => {
  it("máy có sổ sẵn đăng nhập: cả sổ lên tài khoản; máy B thấy đúng", async () => {
    await signUp();
    const A = await device("A");
    await on(A, async () => {
      const lan = await addDebt({ target: { newDebtor: { name: "Chị Lan" } }, amount: 100000 });
      await payDebt({ target: { debtorId: lan.debtor.id }, amount: 30000 });
      expect(await attachAccount(A.me)).toBe("attached");
    });
    await sync(A);
    expect(await on(A, pendingCount)).toBe(0);

    const B = await device("B");
    await on(B, () => attachAccount(B.me));
    await sync(B);
    expect(await on(B, balances)).toEqual({ "Chị Lan": 70000 });
  });

  it("hai máy cùng ghi khi offline cho cùng một người rồi đồng bộ: đủ giao dịch, số dư 120.000", async () => {
    await signUp();
    const A = await device("A");
    const B = await device("B");
    const lanId = await on(A, async () => {
      await attachAccount(A.me);
      return (await addDebt({ target: { newDebtor: { name: "Chị Lan" } }, amount: 100000 })).debtor.id;
    });
    await sync(A);
    await on(B, () => attachAccount(B.me));
    await sync(B);

    // Cả hai offline cùng thao tác.
    await on(A, () => addDebt({ target: { debtorId: lanId }, amount: 30000 }));
    await on(B, () => payDebt({ target: { debtorId: lanId }, amount: 10000 }));

    await sync(A);
    await sync(B);
    await sync(A);
    expect(await on(A, balances)).toEqual({ "Chị Lan": 120000 });
    expect(await on(B, balances)).toEqual({ "Chị Lan": 120000 });
  });

  it("hai máy đổi tên khác nhau: bản tới sau thắng, lịch sử có cả hai lần", async () => {
    await signUp();
    const A = await device("A");
    const B = await device("B");
    const id = await on(A, async () => {
      await attachAccount(A.me);
      return (await addDebt({ target: { newDebtor: { name: "Chi Lan" } }, amount: 1000 })).debtor.id;
    });
    await sync(A);
    await on(B, () => attachAccount(B.me));
    await sync(B);

    await on(A, () => editDebtor(id, { name: "Chị Lan rau", note: "" }));
    await on(B, () => editDebtor(id, { name: "Lan cá", note: "" }));
    await sync(A);
    await sync(B);
    await sync(A);
    for (const dev of [A, B]) {
      expect((await on(dev, () => getDebtor(id)))?.name).toBe("Lan cá");
      expect(await on(dev, () => getDb().debtorEvents.where("debtorId").equals(id).count())).toBe(2);
    }
  });

  it("ghi thêm giao dịch ở máy A không đè tên mà máy B vừa đổi", async () => {
    await signUp();
    const A = await device("A");
    const B = await device("B");
    const id = await on(A, async () => {
      await attachAccount(A.me);
      return (await addDebt({ target: { newDebtor: { name: "Chi Lan" } }, amount: 1000 })).debtor.id;
    });
    await sync(A);
    await on(B, () => attachAccount(B.me));
    await sync(B);
    await on(B, () => editDebtor(id, { name: "Chị Lan", note: "" }));
    await sync(B);
    // Máy A chưa kéo tên mới, chỉ ghi thêm (đổi số dư trên máy) rồi đồng bộ.
    await on(A, () => addDebt({ target: { debtorId: id }, amount: 500 }));
    await sync(A);
    expect((await on(A, () => getDebtor(id)))?.name).toBe("Chị Lan");
  });

  it("sổ 3 người trên máy + tài khoản đã có 5 người → cả hai máy có 8 người", async () => {
    await signUp();
    const A = await device("A");
    await on(A, async () => {
      await attachAccount(A.me);
      for (let i = 1; i <= 5; i++) await addDebt({ target: { newDebtor: { name: `Khách A${i}` } }, amount: 1000 });
    });
    await sync(A);
    const B = await device("B");
    await on(B, async () => {
      for (let i = 1; i <= 3; i++) await addDebt({ target: { newDebtor: { name: `Khách B${i}` } }, amount: 1000 });
      await attachAccount(B.me);
    });
    await sync(B);
    await sync(A);
    expect(await on(A, async () => (await listDebtors()).length)).toBe(8);
    expect(await on(B, async () => (await listDebtors()).length)).toBe(8);
  });

  it("máy đang giữ sổ tài khoản X đăng nhập tài khoản Y: báo khác tài khoản, không gửi gì", async () => {
    await signUp("0912345678", "lan@example.com");
    await signUp("0987654321", "tu@example.com");
    const X = await device("A", "0912345678");
    await on(X, async () => {
      await attachAccount(X.me);
      await addDebt({ target: { newDebtor: { name: "Sổ của X" } }, amount: 1000 });
    });
    await sync(X);
    const Y = await device("A", "0987654321");
    expect(await on(Y, () => attachAccount(Y.me))).toBe("mismatch");

    // Chọn "xoá sổ trên máy để dùng sổ của Y".
    await on(Y, async () => {
      await wipeLocalBook();
      await attachAccount(Y.me);
    });
    await sync(Y);
    expect(await on(Y, listDebtors)).toEqual([]);
    const C = await device("C", "0987654321");
    await on(C, () => attachAccount(C.me));
    await sync(C);
    expect(await on(C, listDebtors)).toEqual([]);
  });
});

describe("tình huống lỗi", () => {
  it("sửa dòng trong lúc request đang chạy thì dòng vẫn chờ đẩy", async () => {
    await signUp();
    const A = await device("A");
    const id = await on(A, async () => {
      await attachAccount(A.me);
      return (await addDebt({ target: { newDebtor: { name: "Chị Lan" } }, amount: 1000 })).debtor.id;
    });
    const slowFetch = async (input: string, init: RequestInit) => {
      const res = await A.client.fetch(input, init);
      await editDebtor(id, { name: "Đổi giữa chừng", note: "" }); // xảy ra khi response chưa được áp
      return res;
    };
    await on(A, () => syncOnce(slowFetch));
    expect((await on(A, () => getDebtor(id)))?._dirty).toBe(1);
    await sync(A);
    expect(await on(A, pendingCount)).toBe(0);
  });

  it("server từ chối xoá hẳn sớm → người đó trở lại thùng rác trên máy", async () => {
    await signUp();
    const A = await device("A");
    const id = await on(A, async () => {
      await attachAccount(A.me);
      return (await addDebt({ target: { newDebtor: { name: "Anh Tú" } }, amount: 1000 })).debtor.id;
    });
    await sync(A);
    // Đồng hồ máy chỉnh lùi 20 ngày: máy tưởng đã đủ 15 ngày.
    await on(A, async () => {
      await deleteDebtor(id, Date.now() - 20 * DAY);
      await purgeDebtor(id, Date.now());
    });
    const res = await sync(A);
    expect(res.rejected).toEqual([{ table: "debtors", id, reason: "purge_too_early" }]);
    expect((await on(A, listTrash)).map((d) => d.id)).toEqual([id]);
  });

  it("phiên hết hạn → SyncAuthError, dữ liệu chờ vẫn giữ", async () => {
    await signUp();
    const A = await device("A");
    await on(A, async () => {
      await attachAccount(A.me);
      await addDebt({ target: { newDebtor: { name: "Chị Lan" } }, amount: 1000 });
    });
    await A.client.post("/api/account/logout");
    await expect(sync(A)).rejects.toBeInstanceOf(SyncAuthError);
    expect(await on(A, pendingCount)).toBe(2);
  });
});
