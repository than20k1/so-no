import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { accountRoutes } from "./account";
import { createAuth, type Auth } from "./auth";
import type { Db } from "./db/client";
import { MemoryMailer, type Mailer } from "./mail";
import { syncRoutes } from "./sync";

export interface AppDeps {
  db: Db;
  mailer: Mailer;
  /** Khoá ký phiên (BETTER_AUTH_SECRET). */
  secret: string;
  /** Địa chỉ gốc của app, vd. https://so-no-theta.vercel.app (BETTER_AUTH_URL). */
  baseURL: string;
  /** Bật endpoint chỉ dành cho e2e (đọc hộp thư). Chỉ khi E2E_TEST=1. */
  testMode?: boolean;
}

export interface AppEnv {
  Variables: { deps: AppDeps; auth: Auth };
}

/**
 * App server thuần Web (Request/Response): chạy trên Vercel qua `api/[...route].ts`,
 * trên Node qua `scripts/api-dev.ts` — đổi nơi chạy không phải sửa file này (design D1).
 */
export function createApp(deps: AppDeps) {
  const auth = createAuth(deps);
  // strict: false → "/api/health" và "/api/health/" là một (vercel.json bật trailingSlash).
  const app = new Hono<AppEnv>({ strict: false }).basePath("/api");

  app.use(async (c, next) => {
    c.set("deps", deps);
    c.set("auth", auth);
    await next();
  });

  // Chống CSRF cho mọi POST: chỉ nhận JSON từ đúng origin của app (design D15).
  const origin = new URL(deps.baseURL).origin;
  app.use(async (c, next) => {
    if (c.req.method === "POST") {
      const sameOrigin = c.req.header("origin") === origin;
      const json = (c.req.header("content-type") ?? "").startsWith("application/json");
      if (!sameOrigin || !json) return c.json({ error: "forbidden" }, 403);
    }
    await next();
  });

  app.route("/account", accountRoutes());
  app.route("/sync", syncRoutes());

  app.get("/health", async (c) => {
    await deps.db.execute(sql`select 1`);
    return c.json({ ok: true });
  });

  if (deps.testMode && deps.mailer instanceof MemoryMailer) {
    const mailer = deps.mailer;
    app.get("/test/outbox", (c) => {
      const to = c.req.query("to") ?? "";
      return c.json({ otp: mailer.lastOtp(to) ?? null, count: mailer.sent.filter((m) => m.to === to).length });
    });
  }

  return app;
}

export type App = ReturnType<typeof createApp>;
