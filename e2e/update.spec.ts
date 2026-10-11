// Cập nhật phiên bản app (spec offline-app-shell, change sua-cap-nhat-phien-ban).
// Mỗi test dựng một server riêng (cổng ngẫu nhiên → service worker riêng) phục vụ bản build `out/`;
// "deploy bản mới" = đổi VERSION trong sw.js để trình duyệt thấy SW khác byte và cài bản mới.
import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";

const ROOT = "out";
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

interface Deploy {
  url: string;
  /** Bản đang "deploy": "A" rồi "B". */
  version: "A" | "B";
  /** Bản A không biết các trang `/chia-tien/` (giả lập bản cũ trước khi có Chia tiền). */
  hideSplitInA: boolean;
  /** Trả sw.js của bản B chậm lại (ms) — để kịp chạm vào màn trước khi bản mới cài xong. */
  swDelayB: number;
  close(): Promise<void>;
}

async function startDeploy(): Promise<Deploy> {
  const original = readFileSync(join(ROOT, "sw.js"), "utf8");
  const d = { version: "A", hideSplitInA: false, swDelayB: 0 } as Deploy;
  const swSource = () => {
    let s = original.replace(/const VERSION = "\w+"/, `const VERSION = "e2e-${d.version}"`);
    if (d.version === "A" && d.hideSplitInA) {
      s = s.replace(/const ASSETS = (\[.*\]);/, (_, list: string) => {
        const assets = (JSON.parse(list) as string[]).filter((u) => !u.startsWith("/chia-tien/"));
        return `const ASSETS = ${JSON.stringify(assets)};`;
      });
    }
    return s;
  };
  const server = createServer((req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname === "/sw.js") {
      const send = () => {
        res.writeHead(200, { "content-type": TYPES[".js"], "cache-control": "no-cache" });
        res.end(swSource());
      };
      if (d.version === "B" && d.swDelayB) setTimeout(send, d.swDelayB);
      else send();
      return;
    }
    let file = join(ROOT, normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, ""));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) {
      res.writeHead(404, { "content-type": TYPES[".html"] });
      res.end(readFileSync(join(ROOT, "404.html")));
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, r));
  d.url = `http://localhost:${(server.address() as AddressInfo).port}`;
  d.close = () => new Promise((r) => server.close(() => r()));
  return d;
}

/** Mã phiên bản của service worker đang điều khiển trang (null khi chưa có hoặc trang đang tải lại). */
function swVersion(page: Page): Promise<string | null> {
  return page
    .evaluate(
      () =>
        new Promise<string | null>((resolve) => {
          const c = navigator.serviceWorker.controller;
          if (!c) return resolve(null);
          const ch = new MessageChannel();
          ch.port1.onmessage = (e) => resolve(String(e.data));
          c.postMessage({ type: "GET_VERSION" }, [ch.port2]);
          setTimeout(() => resolve(null), 1000);
        }),
    )
    .catch(() => null);
}

/** Người dùng quay lại app từ nền (đã quá 60 giây kể từ lần hỏi server trước). */
async function returnToApp(page: Page) {
  await page.clock.fastForward("01:05");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

let deploy: Deploy;
test.beforeEach(async ({ page }) => {
  deploy = await startDeploy();
  await page.clock.install();
});
test.afterEach(async () => deploy.close());

test("quay lại app ở màn chính khi đã deploy bản mới → tự lên bản mới, tải lại vẫn là bản mới", async ({ page }) => {
  await page.goto(deploy.url + "/");
  await expect(page.getByTestId("total")).not.toHaveText("—");
  await expect.poll(() => swVersion(page)).toBe("e2e-A");
  await page.locator("main").click({ position: { x: 4, y: 4 } }); // đã dùng app một lúc

  deploy.version = "B";
  await returnToApp(page);
  await expect.poll(() => swVersion(page), { timeout: 15_000 }).toBe("e2e-B");
  await expect(page.getByTestId("total")).not.toHaveText("—");

  for (let i = 0; i < 3; i++) {
    await page.reload();
    await expect(page.getByTestId("total")).not.toHaveText("—");
    expect(await swVersion(page)).toBe("e2e-B");
    await expect(page.getByTestId("update-bar")).toHaveCount(0);
  }
});

test("đang nhập số tiền khi có bản mới → không tải lại, hiện thanh Cập nhật; bấm thì lên bản mới", async ({ page }) => {
  await page.goto(deploy.url + "/ghi/");
  await expect.poll(() => swVersion(page)).toBe("e2e-A");
  await page.locator("#amount").fill("50");
  await page.evaluate(() => ((window as unknown as { __same: boolean }).__same = true));

  deploy.version = "B";
  await returnToApp(page);
  await expect(page.getByTestId("update-bar")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#amount")).toHaveValue("50");
  expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBe(true);
  expect(await swVersion(page)).toBe("e2e-A");

  await page.getByRole("button", { name: "Cập nhật" }).click();
  await expect.poll(() => swVersion(page), { timeout: 15_000 }).toBe("e2e-B");
  expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBeUndefined();
});

test("từ trang mới /chia-tien/ bấm tab Ghi nợ → không rơi về bản cũ", async ({ page }) => {
  deploy.hideSplitInA = true;
  await page.goto(deploy.url + "/");
  await expect(page.getByTestId("total")).not.toHaveText("—");
  await expect.poll(() => swVersion(page)).toBe("e2e-A");

  // Deploy bản B có trang Chia tiền; bản A không có trong cache → lấy từ mạng.
  deploy.version = "B";
  deploy.swDelayB = 1500;
  await page.goto(deploy.url + "/chia-tien/");
  await page.locator("main").click({ position: { x: 4, y: 4 } }); // chạm trước khi bản mới cài xong
  await expect(page.getByTestId("update-bar")).toBeVisible({ timeout: 15_000 });
  expect(await swVersion(page)).toBe("e2e-A");

  await page.getByRole("tab", { name: "Ghi nợ" }).click();
  await expect.poll(() => swVersion(page), { timeout: 15_000 }).toBe("e2e-B");
  await expect(page.getByTestId("mode-switch")).toBeVisible();
  await expect(page.getByTestId("total")).not.toHaveText("—");
});
