import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { addDebtFlow, openHome, rowFor } from "./helpers";

test("xuất sao lưu rồi nhập vào máy mới: dữ liệu giống hệt; nhập lại không nhân đôi", async ({ page, browser }) => {
  await openHome(page);
  await addDebtFlow(page, "Chị Lan", "200", { create: true, note: "rau" });
  await addDebtFlow(page, "Cô Ba", "1200", { create: true });

  // Tắt Web Share để luồng tải file về chạy được trong trình duyệt test.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
  });
  await page.getByRole("button", { name: "Menu" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất sao lưu" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^ghi-no-\d{4}-\d{2}-\d{2}\.json$/);
  const filePath = test.info().outputPath("backup.json");
  await download.saveAs(filePath);
  const file = JSON.parse(readFileSync(filePath, "utf8"));
  expect(file.debtors).toHaveLength(2);
  expect(file.transactions).toHaveLength(2);

  // "Máy mới" = context trình duyệt mới, IndexedDB trống.
  const fresh = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
  const p2 = await fresh.newPage();
  await openHome(p2);
  await expect(p2.getByText("Sổ còn trống")).toBeVisible();

  async function importFile() {
    await p2.getByRole("button", { name: "Menu" }).click();
    await p2.getByTestId("import-file").setInputFiles(filePath);
    await expect(p2.getByTestId("import-confirm")).toBeVisible();
  }

  await importFile();
  await expect(p2.getByTestId("import-confirm")).toContainText("Sẽ thêm 2 người, 2 giao dịch");
  await p2.getByRole("button", { name: "Nhập", exact: true }).click();
  await expect(p2.getByRole("status")).toContainText("Đã nhập sao lưu");
  await p2.getByTestId("menu-close").click();
  await expect(rowFor(p2, "Chị Lan")).toContainText("200.000 đ");
  await expect(rowFor(p2, "Cô Ba")).toContainText("1.200.000 đ");

  await importFile();
  await expect(p2.getByTestId("import-confirm")).toContainText("Sẽ thêm 0 người, 0 giao dịch");
  await p2.getByRole("button", { name: "Nhập", exact: true }).click();
  await p2.getByTestId("menu-close").click();
  await expect(p2.getByTestId("total")).toHaveText("1.400.000 đ");

  // File hỏng
  await p2.getByRole("button", { name: "Menu" }).click();
  await p2.getByTestId("import-file").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("{oops") });
  await expect(p2.getByRole("status")).toContainText("không đúng định dạng");
  await fresh.close();
});

test("offline: sau lần mở đầu, tắt mạng vẫn mở được app, chuyển trang và ghi nợ", async ({ page, context }) => {
  await openHome(page);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    // Chờ service worker điều khiển trang (clients.claim).
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
    }
    return reg.active?.state;
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("link", { name: "Ghi nợ" })).toBeVisible();
  await expect(page.getByTestId("total")).toHaveText("0 đ");

  await addDebtFlow(page, "Anh Tú", "80", { create: true });
  await expect(rowFor(page, "Anh Tú")).toContainText("80.000 đ");
  await rowFor(page, "Anh Tú").click();
  await expect(page.getByTestId("balance")).toHaveText("80.000 đ");

  // Mở thẳng một trang khác bằng URL khi offline
  await page.goto("/tru/");
  await expect(page.getByRole("heading", { name: "Trừ nợ" })).toBeVisible();
  await context.setOffline(false);
});

test.describe("gợi ý cài trên iPhone", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });

  test("gợi ý nằm trong menu (không ở màn chính), có chấm báo, hướng dẫn Chia sẻ → Thêm vào Màn hình chính, đóng được", async ({ page }) => {
    await openHome(page);
    await expect(page.getByTestId("menu-dot")).toHaveCount(0);
    await addDebtFlow(page, "Anh Tú", "80", { create: true });

    await expect(page.getByTestId("menu-dot")).toBeVisible();
    await expect(page.getByRole("main").getByTestId("install-hint")).toHaveCount(0);

    await page.getByRole("button", { name: "Menu" }).click();
    const hint = page.getByRole("dialog").getByTestId("install-hint");
    await expect(hint).toContainText("Thêm vào Màn hình chính");
    await expect.poll(async () => (await page.locator("nav").boundingBox())?.x).toBe(0);
    await page.screenshot({ path: "test-results/menu-install-hint.png" });
    await hint.getByRole("button", { name: "Đóng" }).click();
    await expect(hint).toHaveCount(0);
    await page.getByTestId("menu-close").click();
    await expect(page.getByTestId("menu-dot")).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("total")).toHaveText("80.000 đ");
    await expect(page.getByTestId("menu-dot")).toHaveCount(0);
  });
});
