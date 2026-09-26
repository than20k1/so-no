import { defineConfig } from "@playwright/test";

const PORT = 3100;

// Chạy trên bản build tĩnh (`npm run build` trước) để kiểm tra đúng những gì sẽ deploy, kể cả service worker.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 360, height: 640 },
    isMobile: true,
    hasTouch: true,
    locale: "vi-VN",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve.mjs",
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
