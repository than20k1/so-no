// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "./db/schema.js";
import { createHarness, type TestClient } from "./test/harness.js";

const MIN = 60 * 1000;
let h: Awaited<ReturnType<typeof createHarness>>;

beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => {
  vi.useRealTimers();
});

const LAN = { phone: "0912 345 678", email: "lan@example.com", password: "123456", confirmPassword: "123456" };

async function registerAndVerify(client: TestClient, data = LAN) {
  expect((await client.post("/api/account/register", data)).status).toBe(200);
  const otp = h.mailer.lastOtp(data.email)!;
  return client.post("/api/account/verify", { email: data.email, otp });
}

describe("đăng ký", () => {
  it("thành công: gửi OTP, xác nhận xong là đăng nhập và có sổ", async () => {
    const c = h.client();
    const verify = await registerAndVerify(c);
    expect(verify.status).toBe(200);
    expect(verify.body).toMatchObject({ phone: "+84912345678" });
    expect(verify.body.bookId).toMatch(/^[0-9a-f-]{36}$/);
    const me = await c.get("/api/account/me");
    expect(me.body).toEqual(verify.body);
    expect(h.mailer.sent[0].subject).toContain("kích hoạt");
  });

  it("kiểm tra dữ liệu vào", async () => {
    const c = h.client();
    const bad = async (patch: object) => (await c.post("/api/account/register", { ...LAN, ...patch })).body.error;
    expect(await bad({ phone: "0123" })).toBe("invalid_phone");
    expect(await bad({ email: "lan@" })).toBe("invalid_email");
    expect(await bad({ password: "12345", confirmPassword: "12345" })).toBe("password_too_short");
    expect(await bad({ confirmPassword: "1234567" })).toBe("password_mismatch");
    expect(h.mailer.sent).toHaveLength(0);
  });

  it("SĐT đã có tài khoản (viết kiểu khác) hoặc email đã dùng thì báo trùng", async () => {
    await registerAndVerify(h.client());
    const c = h.client();
    const byPhone = await c.post("/api/account/register", { ...LAN, phone: "+84912345678", email: "khac@example.com" });
    expect(byPhone).toMatchObject({ status: 409, body: { error: "phone_taken" } });
    const byEmail = await c.post("/api/account/register", { ...LAN, phone: "0987654321" });
    expect(byEmail).toMatchObject({ status: 409, body: { error: "email_taken" } });
  });

  it("đăng ký dở (chưa xác nhận) thì đăng ký lại được, ví dụ gõ sai email lần đầu", async () => {
    const c = h.client();
    await c.post("/api/account/register", { ...LAN, email: "sai@example.com" });
    const again = await registerAndVerify(c, LAN);
    expect(again.status).toBe(200);
  });

  it("mã sai 5 lần thì mã bị vô hiệu kể cả nhập đúng", async () => {
    const c = h.client();
    await c.post("/api/account/register", LAN);
    const otp = h.mailer.lastOtp(LAN.email)!;
    const wrong = otp === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await c.post("/api/account/verify", { email: LAN.email, otp: wrong });
    const res = await c.post("/api/account/verify", { email: LAN.email, otp });
    expect(res.status).toBe(400);
    expect(["too_many_attempts", "invalid_otp"]).toContain(res.body.error);
    expect((await c.get("/api/account/me")).status).toBe(401);
  });

  it("mã hết hạn sau 10 phút", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const c = h.client();
    await c.post("/api/account/register", LAN);
    const otp = h.mailer.lastOtp(LAN.email)!;
    vi.setSystemTime(Date.now() + 11 * MIN);
    expect((await c.post("/api/account/verify", { email: LAN.email, otp })).body.error).toBe("otp_expired");
  });

  it("gửi lại mã: dưới 60 giây bị từ chối, sau đó gửi được", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const c = h.client();
    await c.post("/api/account/register", LAN);
    expect((await c.post("/api/account/resend", { email: LAN.email })).body.error).toBe("resend_too_soon");
    vi.setSystemTime(Date.now() + 61 * 1000);
    expect((await c.post("/api/account/resend", { email: LAN.email })).status).toBe(200);
    expect(h.mailer.sent).toHaveLength(2);
  });
});

describe("đăng nhập", () => {
  it("đúng SĐT (viết kiểu nào cũng được) và mật khẩu thì đăng nhập", async () => {
    await registerAndVerify(h.client());
    const c = h.client();
    const res = await c.post("/api/account/login", { phone: "+84 912 345 678", password: "123456" });
    expect(res).toMatchObject({ status: 200, body: { phone: "+84912345678" } });
    expect((await c.get("/api/account/me")).status).toBe(200);
  });

  it("chưa xác nhận email thì chặn, gửi lại mã, không tạo phiên", async () => {
    const c = h.client();
    await c.post("/api/account/register", LAN);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2 * MIN);
    const res = await c.post("/api/account/login", { phone: LAN.phone, password: "123456" });
    expect(res).toMatchObject({ status: 403, body: { error: "email_not_verified", email: LAN.email } });
    expect((await c.get("/api/account/me")).status).toBe(401);
    expect(await h.db.select().from(schema.session)).toHaveLength(0);
    expect(h.mailer.sent).toHaveLength(2);
  });

  it("sai 5 lần thì khoá 15 phút kể cả nhập đúng; hết 15 phút thì mở", async () => {
    await registerAndVerify(h.client());
    vi.useFakeTimers({ toFake: ["Date"] });
    const c = h.client();
    for (let i = 0; i < 4; i++) {
      expect((await c.post("/api/account/login", { phone: LAN.phone, password: "sai" })).body.error).toBe(
        "invalid_credentials",
      );
    }
    expect((await c.post("/api/account/login", { phone: LAN.phone, password: "sai" })).body.error).toBe("locked");
    const locked = await c.post("/api/account/login", { phone: LAN.phone, password: "123456" });
    expect(locked).toMatchObject({ status: 423, body: { error: "locked" } });
    expect(locked.body.retryAfter).toBeGreaterThan(14 * 60);

    vi.setSystemTime(Date.now() + 15 * MIN + 1000);
    expect((await c.post("/api/account/login", { phone: LAN.phone, password: "123456" })).status).toBe(200);
  });

  it("thông báo sai giống nhau dù SĐT có hay không có tài khoản", async () => {
    await registerAndVerify(h.client());
    const c = h.client();
    const wrongPass = await c.post("/api/account/login", { phone: LAN.phone, password: "sai" });
    const noAccount = await c.post("/api/account/login", { phone: "0987654321", password: "sai" });
    expect(wrongPass).toEqual(noAccount);
  });
});

describe("quên mật khẩu", () => {
  it("đặt lại: mật khẩu cũ hỏng, phiên cũ bị 401, khoá được gỡ", async () => {
    const old = h.client();
    await registerAndVerify(old);
    const c = h.client();
    for (let i = 0; i < 5; i++) await c.post("/api/account/login", { phone: LAN.phone, password: "sai" });

    const forgot = await c.post("/api/account/forgot", { phone: LAN.phone });
    expect(forgot.body).toEqual({ ok: true, maskedEmail: "la***@example.com" });
    const otp = h.mailer.lastOtp(LAN.email)!;
    const reset = await c.post("/api/account/reset", {
      phone: LAN.phone,
      otp,
      password: "654321",
      confirmPassword: "654321",
    });
    expect(reset.status).toBe(200);

    expect((await old.get("/api/account/me")).status).toBe(401);
    expect((await c.post("/api/account/login", { phone: LAN.phone, password: "123456" })).status).toBe(401);
    expect((await c.post("/api/account/login", { phone: LAN.phone, password: "654321" })).status).toBe(200);
  });

  it("SĐT không có tài khoản: phản hồi cùng dạng, không gửi mail", async () => {
    const res = await h.client().post("/api/account/forgot", { phone: "0987654321" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.maskedEmail).toMatch(/^[a-z]{2}\*\*\*@gmail\.com$/);
    expect(h.mailer.sent).toHaveLength(0);
  });

  it("mật khẩu mới không khớp thì báo lỗi", async () => {
    await registerAndVerify(h.client());
    const res = await h.client().post("/api/account/reset", {
      phone: LAN.phone,
      otp: "123456",
      password: "654321",
      confirmPassword: "000000",
    });
    expect(res.body.error).toBe("password_mismatch");
  });
});

describe("phiên và bảo vệ", () => {
  it("đăng xuất thì me trả 401", async () => {
    const c = h.client();
    await registerAndVerify(c);
    await c.post("/api/account/logout");
    expect((await c.get("/api/account/me")).status).toBe(401);
  });

  it("POST sai origin hoặc không phải JSON bị từ chối", async () => {
    const c = h.client();
    const evil = await c.request("POST", "/api/account/login", { phone: LAN.phone, password: "x" }, {
      origin: "https://evil.example",
    });
    expect(evil.status).toBe(403);
    const form = await h.app.request("/api/account/login", {
      method: "POST",
      headers: { origin: "http://localhost:3100", "content-type": "application/x-www-form-urlencoded" },
      body: "phone=1",
    });
    expect(form.status).toBe(403);
  });
});
