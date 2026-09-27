// Khôi phục người nợ đã xoá/xoá hẳn của một tài khoản (khách gọi nhờ).
//   Chạy thử (chỉ liệt kê):  DATABASE_URL="<chuỗi production từ Neon>" npm run admin:restore -- --phone 0912345678 --name "Anh Tú"
//   Khôi phục thật:          ... thêm --apply
// Không lưu chuỗi production vào file; dán trực tiếp khi chạy.
import { parseArgs } from "node:util";
import { adminRestore } from "../server/admin.js";
import { createPgDb } from "../server/db/client.js";

const { values } = parseArgs({
  options: { phone: { type: "string" }, name: { type: "string" }, apply: { type: "boolean", default: false } },
});
if (!values.phone || !values.name) {
  console.error('Cần --phone và --name, ví dụ: --phone 0912345678 --name "Anh Tú" [--apply]');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL");

const fmt = (t: number | null) => (t ? new Date(t).toLocaleString("vi-VN") : "—");
const { matches, restored } = await adminRestore(createPgDb(url), values.phone, values.name, values.apply);
if (matches.length === 0) console.log("Không tìm thấy người nợ đã xoá nào khớp.");
for (const m of matches) {
  console.log(`- ${m.name}${m.note ? ` (${m.note})` : ""} · xoá: ${fmt(m.deletedAt)} · xoá hẳn: ${fmt(m.purgedAt)} · id ${m.id}`);
}
console.log(values.apply ? `Đã khôi phục ${restored} người. Máy của khách sẽ thấy lại ở lần đồng bộ sau.` : "Chạy thử — thêm --apply để khôi phục.");
process.exit(0);
