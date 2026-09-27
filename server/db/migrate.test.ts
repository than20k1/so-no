// @vitest-environment node
import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { queryRows } from "./client";
import { createPgliteDb } from "./pglite";

it("migration tạo đủ bảng Better Auth, bảng sổ nợ và sequence đồng bộ", async () => {
  const db = await createPgliteDb();
  const tables = await queryRows<{ table_name: string }>(
    db,
    sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
  );
  expect(tables.map((r) => r.table_name)).toEqual(
    expect.arrayContaining([
      "account",
      "books",
      "debtor_events",
      "debtors",
      "login_throttle",
      "rate_limit",
      "session",
      "transactions",
      "user",
      "verification",
    ]),
  );
  const [seq] = await queryRows<{ n: string }>(db, sql`select nextval('sync_seq') as n`);
  expect(Number(seq.n)).toBeGreaterThan(0);
});
