import type { AppDeps } from "./app.js";
import type { Db } from "./db/client.js";
import { mailerFromEnv } from "./mail.js";

/** Dựng phụ thuộc của app từ biến môi trường — dùng chung cho Vercel và Node. */
export function depsFromEnv(db: Db, env: Record<string, string | undefined> = process.env): AppDeps {
  const secret = env.BETTER_AUTH_SECRET;
  const baseURL = env.BETTER_AUTH_URL;
  if (!secret || !baseURL) throw new Error("Thiếu BETTER_AUTH_SECRET / BETTER_AUTH_URL");
  return { db, secret, baseURL, mailer: mailerFromEnv(env), testMode: env.E2E_TEST === "1" };
}
