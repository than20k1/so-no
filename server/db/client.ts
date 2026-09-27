import type { SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

/** Kiểu DB dùng chung cho Postgres thật (pg) và PGlite (test) — code nghiệp vụ chỉ biết kiểu này. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_FOLDER = new URL("./migrations", import.meta.url).pathname;

/**
 * Postgres thật qua `pg` (Neon hay bất kỳ Postgres nào). Mỗi function instance chỉ giữ 1 kết nối,
 * dùng chuỗi pooled của Neon để nhiều instance không làm cạn kết nối (design D2).
 */
export function createPgDb(url: string): Db {
  const pool = new Pool({ connectionString: strictSsl(url), max: 1 });
  return drizzle(pool, { schema });
}

/** Chạy SQL thô và trả về các dòng — `pg` và PGlite đều trả `{ rows }`. */
export async function queryRows<T>(db: Db, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows: T[] };
  return result.rows;
}

/** `pg` vốn đã coi `sslmode=require` là `verify-full` (kiểm tra chứng chỉ); ghi rõ để khỏi cảnh báo. */
export function strictSsl(url: string): string {
  return url.replace(/sslmode=(prefer|require|verify-ca)\b/, "sslmode=verify-full");
}
