// Sinh biểu tượng PNG cho PWA từ một mẫu HTML (chạy tay khi đổi logo): node scripts/gen-icons.mjs
import { chromium } from "@playwright/test";

const SIZES = [
  { file: "public/icon-192.png", size: 192 },
  { file: "public/icon-512.png", size: 512 },
  { file: "public/apple-touch-icon.png", size: 180 },
];

const html = (size) => `<!doctype html><html><body style="margin:0">
<div style="width:${size}px;height:${size}px;background:#b4321f;display:grid;place-items:center;
  font:800 ${Math.round(size * 0.42)}px system-ui,-apple-system,sans-serif;color:#fff;letter-spacing:-0.02em">Nợ</div>
</body></html>`;

const browser = await chromium.launch();
for (const { file, size } of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(size));
  await page.screenshot({ path: file });
  await page.close();
  console.log("wrote", file);
}
await browser.close();
