// Chạy server API trên Node (máy dev, e2e, hoặc VPS sau này): npm run dev:api
// DATABASE_URL=pglite://memory → Postgres trong bộ nhớ (e2e, không cần mạng).
import { serve } from "@hono/node-server";
import { createApp } from "../server/app.js";
import { createPgDb, type Db } from "../server/db/client.js";
import { depsFromEnv } from "../server/env.js";

const PORT = Number(process.env.API_PORT ?? 3101);
const url = process.env.DATABASE_URL ?? "pglite://memory";

let db: Db;
if (url.startsWith("pglite")) {
  const { createPgliteDb } = await import("../server/db/pglite.js");
  db = await createPgliteDb();
} else {
  db = createPgDb(url);
}

serve({ fetch: createApp(depsFromEnv(db)).fetch, port: PORT }, () =>
  console.log(`API ở http://localhost:${PORT}/api (${url.startsWith("pglite") ? "PGlite trong bộ nhớ" : "Postgres"})`),
);
