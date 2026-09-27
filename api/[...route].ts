// Điểm vào Vercel Function: mọi request /api/* đi vào app Hono (server/app.ts).
import { handle } from "hono/vercel";
import { createApp } from "../server/app";
import { createPgDb } from "../server/db/client";
import { depsFromEnv } from "../server/env";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL");

const app = createApp(depsFromEnv(createPgDb(url)));
const handler = handle(app);

export const GET = handler;
export const POST = handler;
