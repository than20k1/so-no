// Điểm vào Vercel Function: mọi request /api/* được rewrite (vercel.json) vào đây rồi đi vào app Hono (server/app.ts).
// Dùng một function + rewrite thay cho api/[...route].ts vì trailingSlash của vercel.json thêm "/" cuối đường dẫn,
// làm route động của Vercel không khớp (404). Hono vẫn nhận nguyên đường dẫn gốc.
import { handle } from "hono/vercel";
import { createApp } from "../server/app.js";
import { createPgDb } from "../server/db/client.js";
import { depsFromEnv } from "../server/env.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL");

const app = createApp(depsFromEnv(createPgDb(url)));
const handler = handle(app);

export const GET = handler;
export const POST = handler;
