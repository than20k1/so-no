// @vitest-environment node
import { expect, it } from "vitest";
import { createApp } from "./app.js";
import { createPgliteDb } from "./db/pglite.js";
import { ConsoleMailer, GmailMailer, mailerFromEnv, MemoryMailer } from "./mail.js";
import { createHarness } from "./test/harness.js";

it("chọn nơi gửi mail theo môi trường", () => {
  expect(mailerFromEnv({ E2E_TEST: "1" })).toBeInstanceOf(MemoryMailer);
  expect(mailerFromEnv({ GMAIL_USER: "a@gmail.com", GMAIL_APP_PASSWORD: "x" })).toBeInstanceOf(GmailMailer);
  expect(mailerFromEnv({})).toBeInstanceOf(ConsoleMailer);
  expect(() => mailerFromEnv({ VERCEL_ENV: "production" })).toThrow();
});

it("hộp thư bộ nhớ đọc lại được mã OTP qua /api/test/outbox khi ở chế độ test", async () => {
  const h = await createHarness();
  await h.mailer.send({ to: "lan@example.com", subject: "Mã", text: "Mã của bạn: 482913" });
  const res = await h.client().get("/api/test/outbox?to=lan@example.com");
  expect(res.body).toEqual({ otp: "482913", count: 1 });
});

it("không có chế độ test thì /api/test/outbox không tồn tại", async () => {
  const app = createApp({
    db: await createPgliteDb(),
    mailer: new MemoryMailer(),
    secret: "t".repeat(32),
    baseURL: "http://localhost:3100",
  });
  expect((await app.request("/api/test/outbox?to=x")).status).toBe(404);
});
