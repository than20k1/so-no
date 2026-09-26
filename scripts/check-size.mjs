// Đo tổng dung lượng JS (gzip) mà trang `/` tải khi mở, báo lỗi nếu vượt ngân sách.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const OUT = "out";
const BUDGET_KB = 180;

const html = readFileSync(join(OUT, "index.html"), "utf8");
// Bỏ qua script `noModule` (polyfill cho trình duyệt cũ) vì trình duyệt hiện đại không tải nó.
const srcs = [
  ...new Set(
    [...html.matchAll(/<script[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => !/nomodule/i.test(tag))
      .map((tag) => tag.match(/src="([^"]+\.js)"/)?.[1])
      .filter(Boolean),
  ),
];

let total = 0;
for (const src of srcs) {
  const size = gzipSync(readFileSync(join(OUT, src))).length;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${src}`);
}

const totalKb = total / 1024;
console.log(`${totalKb.toFixed(1).padStart(7)} KB  TỔNG (ngân sách ${BUDGET_KB} KB)`);

if (totalKb > BUDGET_KB) {
  console.error(`Vượt ngân sách JS: ${totalKb.toFixed(1)} KB > ${BUDGET_KB} KB`);
  process.exit(1);
}
