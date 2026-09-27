import { defineConfig } from "@playwright/test";

const PORT = 3100;
const API_PORT = 3101;
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
    : [
        {
          // API chạy Postgres trong bộ nhớ (PGlite) + hộp thư giả: không cần mạng, không gửi mail thật.
          command: "npx tsx scripts/api-dev.ts",
          url: `http://localhost:${API_PORT}/api/health`,
          reuseExistingServer: false,
          env: {
            API_PORT: String(API_PORT),
            DATABASE_URL: "pglite://memory",
            E2E_TEST: "1",
            BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-00",
            BETTER_AUTH_URL: `http://localhost:${PORT}`,
          },
        },
        {
          command: "node scripts/serve.mjs",
          port: PORT,
          reuseExistingServer: !process.env.CI,
          env: { API_URL: `http://localhost:${API_PORT}` },
        },
      ],
});
