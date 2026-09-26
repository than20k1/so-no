// Đo thời gian mở app trên bản build (`npm run build && npm run serve` trước):
// Chrome thật + giả lập Slow 4G (RTT 150ms, ~1,6Mbps) và CPU chậm 4 lần, như cấu hình mobile của Lighthouse.
//   - "nút hiện": hai nút Ghi nợ/Trừ nợ xuất hiện (là link thường nên bấm được ngay cả trước khi JS chạy)
//   - "app sẵn sàng": React đã hydrate và đọc xong sổ từ IndexedDB (ô tổng tiền có số)
import { chromium } from "@playwright/test";

const URL = process.env.URL ?? "http://localhost:3100/";
const RUNS = Number(process.env.RUNS ?? 3);

async function throttle(page, { network }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  if (network) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  }
}

async function openAndTime(page) {
  const start = Date.now();
  await page.goto(URL, { waitUntil: "commit" });
  await page.getByRole("link", { name: "Ghi nợ" }).waitFor();
  const buttons = Date.now() - start;
  await page.waitForFunction(() => document.querySelector('[data-testid="total"]')?.textContent !== "—");
  return { buttons, ready: Date.now() - start };
}

const browser = await chromium.launch();
const results = { cold: [], warm: [] };

for (let i = 0; i < RUNS; i++) {
  const context = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await throttle(page, { network: true });
  results.cold.push(await openAndTime(page));

  // Chờ service worker cài xong và điều khiển trang, rồi đo lần mở sau (tab mới, cùng máy).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
    }
  });
  await page.close();
  const again = await context.newPage();
  await throttle(again, { network: true });
  results.warm.push(await openAndTime(again));
  await context.close();
}
await browser.close();

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const [name, rows] of Object.entries(results)) {
  const label = name === "cold" ? "Lần mở đầu" : "Lần mở sau";
  console.log(
    `${label}: nút hiện ${median(rows.map((r) => r.buttons))} ms, app sẵn sàng ${median(rows.map((r) => r.ready))} ms` +
      `  (các lần: ${rows.map((r) => `${r.buttons}/${r.ready}`).join(", ")})`,
  );
}
