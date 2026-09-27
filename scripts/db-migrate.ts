// Chạy migration lên Postgres theo DATABASE_URL: npm run db:migrate
// Mặc định đọc .env.local (nhánh Neon `dev`).
// Production: Vercel tự chạy lúc deploy (`npm run db:migrate:deploy` trong buildCommand) với DATABASE_URL của Vercel —
// không ai phải chép chuỗi kết nối production ra máy. Bản Preview bỏ qua để không đụng DB thật.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { MIGRATIONS_FOLDER, strictSsl } from "../server/db/client";

if (process.argv.includes("--deploy") && process.env.VERCEL_ENV !== "production") {
  console.log(`Bỏ qua migration (VERCEL_ENV=${process.env.VERCEL_ENV ?? "không có"}) — chỉ chạy khi deploy Production.`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL");

const pool = new Pool({ connectionString: strictSsl(url), max: 1 });
await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
const { rows } = await pool.query(
  "select table_name from information_schema.tables where table_schema = 'public' order by 1",
);
console.log(`Đã migrate ${new URL(url).hostname.split(".")[0]}: ${rows.map((r) => r.table_name).join(", ")}`);
await pool.end();
