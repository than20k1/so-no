import { defineConfig } from "@playwright/test";

const PORT = 3100;
// BASE_URL=https://... để chạy e2e trên bản đã deploy (bỏ qua server local).
const BASE_URL = process.env.BASE_URL;

// Chạy trên bản build tĩnh (`npm run build` trước) để kiểm tra đúng những gì sẽ deploy, kể cả service worker.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL ?? `http://localhost:${PORT}`,
    viewport: { width: 360, height: 640 },
    isMobile: true,
    hasTouch: true,
    locale: "vi-VN",
    trace: "retain-on-failure",
  },
  webServer: BASE_URL
    ? undefined
    : {
        command: "node scripts/serve.mjs",
        port: PORT,
        reuseExistingServer: !process.env.CI,
      },
});
