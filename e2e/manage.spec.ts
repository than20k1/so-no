import { expect, test, type Page } from "@playwright/test";
import { addButton, addDebtFlow, debtorList, openHome, rowFor } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;

async function openEdit(page: Page, name: string) {
  await rowFor(page, name).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByRole("button", { name: "Sửa" }).click();
  await expect(page.getByTestId("edit-sheet")).toBeVisible();
}

async function deleteFromDetail(page: Page, name: string, balance: string) {
  await openEdit(page, name);
  await page.getByRole("button", { name: "Xoá người này" }).click();
  await expect(page.getByTestId("delete-confirm")).toContainText(balance);
  await page.getByTestId("delete-confirm").getByRole("button", { name: "Xoá" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function openTrashFromMenu(page: Page, count: number) {
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByTestId("menu-trash")).toContainText(`Thùng rác${count}`);
  await page.getByTestId("menu-trash").click();
  await expect(page).toHaveURL(/\/thung-rac\/$/);
}

test("sửa tên: tên mới hiện ở chi tiết, màn chính, gợi ý; có lịch sử sửa; cảnh báo trùng tên", async ({ page }) => {
  await openHome(page);
  await addDebtFlow(page, "Chi Lan", "200", { create: true });
  await addDebtFlow(page, "Cô Ba", "50", { create: true });

  await openEdit(page, "Chi Lan");
  await page.getByTestId("edit-name").fill("cô ba");
  await expect(page.getByTestId("duplicate-warning")).toBeVisible();
  await page.getByTestId("edit-name").fill("");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByTestId("edit-error")).toHaveText("Tên không được để trống.");

  await page.getByTestId("edit-name").fill("Chị Lan rau");
  await expect(page.getByTestId("duplicate-warning")).toBeHidden();
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByTestId("edit-sheet")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Chị Lan rau" })).toBeVisible();
  await expect(page.getByTestId("balance")).toHaveText("200.000 đ");
  await expect(page.getByTestId("edit-history").getByTestId("edit-row").first()).toContainText(
    "Đổi tên: Chi Lan → Chị Lan rau",
  );
  await page.screenshot({ path: "test-results/edit-history.png" });

  await page.getByRole("button", { name: "Quay lại" }).click();
  await expect(rowFor(page, "Chị Lan rau")).toContainText("200.000 đ");
  await addButton(page).click();
  await page.locator("#name").fill("lan rau");
  await expect(page.getByRole("option", { name: /Chị Lan rau/ })).toBeVisible();
});

test("xoá: hoàn tác được; người đã xoá không ở danh sách, tổng tiền, tìm kiếm, gợi ý; thùng rác và khôi phục", async ({
  page,
}) => {
  await openHome(page);
  await addDebtFlow(page, "Anh Tú", "150", { create: true });
  await addDebtFlow(page, "Cô Ba", "100", { create: true });
  await expect(page.getByTestId("total")).toHaveText("250.000 đ");

  await deleteFromDetail(page, "Anh Tú", "150.000 đ");
  await expect(page.getByTestId("total")).toHaveText("100.000 đ");
  await expect(rowFor(page, "Anh Tú")).toHaveCount(0);
  await page.getByRole("button", { name: "Hoàn tác" }).click();
  await expect(rowFor(page, "Anh Tú")).toContainText("150.000 đ");
  await expect(page.getByTestId("total")).toHaveText("250.000 đ");

  await deleteFromDetail(page, "Anh Tú", "150.000 đ");
  await page.getByRole("searchbox").fill("tu");
  await expect(page.getByText("Không tìm thấy ai.")).toBeVisible();
  await page.getByRole("searchbox").fill("");

  await addButton(page).click();
  await page.locator("#name").fill("tu");
  await expect(page.getByRole("option")).toHaveCount(1); // chỉ còn "+ Tạo mới"
  await page.getByRole("button", { name: "Quay lại" }).click();

  await deleteFromDetail(page, "Cô Ba", "100.000 đ");
  await expect(page.getByTestId("total")).toHaveText("0 đ");
  await openTrashFromMenu(page, 2);
  const rows = page.getByTestId("trash-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Cô Ba");
  await expect(rows.first()).toContainText("Tự xoá hẳn sau 30 ngày");
  await expect(rows.first().getByRole("button", { name: "Xoá hẳn" })).toBeDisabled();
  await page.screenshot({ path: "test-results/trash.png" });

  // Mở chi tiết người trong thùng rác: chỉ có nút Khôi phục.
  await rows.filter({ hasText: "Anh Tú" }).getByRole("link").click();
  await expect(page.getByTestId("deleted-banner")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ghi thêm" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sửa" })).toHaveCount(0);
  await page.getByRole("button", { name: "Khôi phục" }).click();
  await expect(page.getByTestId("deleted-banner")).toBeHidden();
  await expect(page.getByRole("link", { name: "Ghi thêm" })).toBeVisible();

  await page.goto("/");
  await expect(rowFor(page, "Anh Tú")).toContainText("150.000 đ");
  await expect(debtorList(page).getByRole("link")).toHaveCount(1);
});

test("mốc 15/30 ngày: chưa đủ 15 ngày không xoá hẳn được, đủ thì được, đủ 30 ngày tự xoá hẳn", async ({ page }) => {
  const t0 = new Date(2026, 8, 1, 8, 0).getTime();
  await page.clock.setFixedTime(t0);
  await openHome(page);
  await addDebtFlow(page, "Anh Tú", "10", { create: true });
  await addDebtFlow(page, "Cô Ba", "20", { create: true });
  await deleteFromDetail(page, "Anh Tú", "10.000 đ");
  await deleteFromDetail(page, "Cô Ba", "20.000 đ");

  await page.clock.setFixedTime(t0 + 14 * DAY);
  await page.goto("/thung-rac/");
  const tu = page.getByTestId("trash-row").filter({ hasText: "Anh Tú" });
  await expect(tu.getByRole("button", { name: "Xoá hẳn" })).toBeDisabled();
  await expect(tu.getByTestId("purge-allowed-from")).toHaveText("Xoá hẳn được từ ngày 16/09");

  await page.clock.setFixedTime(t0 + 16 * DAY);
  await page.reload();
  await tu.getByRole("button", { name: "Xoá hẳn" }).click();
  await tu.getByTestId("purge-confirm").getByRole("button", { name: "Xoá hẳn" }).click();
  await expect(page.getByTestId("trash-row")).toHaveCount(1);
  await expect(page.getByTestId("trash-row")).toContainText("Cô Ba");

  await page.clock.setFixedTime(t0 + 31 * DAY);
  await page.goto("/");
  await expect(page.getByTestId("total")).toHaveText("0 đ");
  await page.goto("/thung-rac/");
  await expect(page.getByText("Thùng rác trống.")).toBeVisible();
});

test("offline: xoá rồi khôi phục khi mất mạng", async ({ page, context }) => {
  await openHome(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
    }
  });
  await addDebtFlow(page, "Anh Tú", "80", { create: true });
  await expect(rowFor(page, "Anh Tú")).toContainText("80.000 đ");

  await context.setOffline(true);
  await page.reload();
  await deleteFromDetail(page, "Anh Tú", "80.000 đ");
  await openTrashFromMenu(page, 1);
  await page.getByRole("button", { name: "Khôi phục" }).click();
  await expect(page.getByText("Thùng rác trống.")).toBeVisible();
  await page.goto("/");
  await expect(rowFor(page, "Anh Tú")).toContainText("80.000 đ");
  await context.setOffline(false);
});
