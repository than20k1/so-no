import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Test server dựng Postgres trong bộ nhớ (PGlite) cho mỗi test — chạy song song thì chậm hơn 5 giây mặc định.
    testTimeout: 20_000,
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "e2e", "out", ".next"],
  },
});
