// Sinh biểu tượng PNG cho PWA từ scripts/icon.svg (chạy tay khi đổi logo): node scripts/gen-icons.mjs
// Chữ trong SVG được vẽ bằng font của máy chạy lệnh này; chỉ PNG được phát hành nên điện thoại không phụ thuộc font.
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync(new URL("./icon.svg", import.meta.url), "utf8");
// Màu nền của icon — dùng để lấp lề cho bản maskable.
const BG = "#b4321f";

const ICONS = [
  { file: "public/icon-32.png", size: 32 },
  { file: "public/icon-192.png", size: 192 },
  { file: "public/icon-512.png", size: 512 },
  { file: "public/apple-touch-icon.png", size: 180 },
  // Maskable: hệ điều hành cắt icon theo hình tròn/bo góc; thu hình còn 80% để cuốn sổ nằm trong vùng an toàn.
  { file: "public/icon-maskable-512.png", size: 512, scale: 0.8 },
];

const html = (size, scale = 1) => `<!doctype html><html><body style="margin:0">
<div style="width:${size}px;height:${size}px;background:${BG};display:grid;place-items:center">
  <div style="width:${size * scale}px;height:${size * scale}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div>
</div></body></html>`;

const browser = await chromium.launch();
for (const { file, size, scale } of ICONS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(size, scale));
  await page.screenshot({ path: file });
  await page.close();
  console.log("wrote", file);
}
await browser.close();
