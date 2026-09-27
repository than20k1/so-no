// Postgres chạy trong tiến trình cho test và e2e — không import từ code production (thư viện nặng).
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_FOLDER, type Db } from "./client";
import * as schema from "./schema";

/** DB trống trong bộ nhớ, đã chạy đủ migration. */
export async function createPgliteDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Db;
}
