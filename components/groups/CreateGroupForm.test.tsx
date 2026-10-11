import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n";
import { CreateGroupForm } from "./GroupsScreen";

const push = vi.hoisted(() => vi.fn());
const createGroup = vi.hoisted(() => vi.fn(async () => "g1"));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/groups/groups", async (orig) => ({ ...(await orig<typeof import("@/lib/groups/groups")>()), createGroup }));
vi.mock("@/lib/sync", () => ({ syncNow: vi.fn(async () => {}) }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function renderForm() {
  render(
    <I18nProvider>
      <CreateGroupForm onCancel={() => {}} />
    </I18nProvider>,
  );
  const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  return {
    fill(groupName: string, leader: string, members: string) {
      type("Tên nhóm", groupName);
      type("Tên trưởng nhóm (tài khoản này)", leader);
      type(/^Thành viên/, members);
    },
    submit: () => fireEvent.click(screen.getByRole("button", { name: "Tạo" })),
  };
}

describe("form tạo nhóm kèm thành viên", () => {
  it("nhãn trưởng nhóm, ô thành viên nhiều dòng và bộ đếm số người", () => {
    const f = renderForm();
    expect(screen.getByLabelText("Tên trưởng nhóm (tài khoản này)")).toBeTruthy();
    expect(screen.getByTestId("member-count").textContent).toBe("1 người");

    f.fill("Đà Lạt", "Thân", "Vũ\nHoàng\nLương");
    expect(screen.getByTestId("member-count").textContent).toBe("4 người");
    expect(screen.queryByTestId("group-error")).toBeNull();
  });

  it("tạo nhóm: gửi danh sách đã làm sạch (bỏ dòng trống), rồi vào nhóm", async () => {
    const f = renderForm();
    f.fill("Đà Lạt", "Thân", "Vũ\n\n  Hoàng  \n");
    expect(screen.getByTestId("member-count").textContent).toBe("3 người");
    f.submit();
    await waitFor(() => expect(createGroup).toHaveBeenCalledWith({ name: "Đà Lạt", selfName: "Thân", guests: ["Vũ", "Hoàng"] }));
    expect(push).toHaveBeenCalledWith("/chia-tien/nhom/?id=g1");
  });

  it("trùng tên trong danh sách: báo ngay khi gõ, bấm Tạo không tạo nhóm, nội dung còn nguyên", () => {
    const f = renderForm();
    f.fill("Đà Lạt", "Thân", "Vũ\nvu");
    expect(screen.getByTestId("group-error").textContent).toBe("Có 2 người tên “Vũ” trùng nhau");
    expect((screen.getByRole("button", { name: "Tạo" }) as HTMLButtonElement).disabled).toBe(true);

    f.submit();
    fireEvent.submit(screen.getByTestId("create-group")); // Enter trong ô nhập cũng không qua được
    expect(createGroup).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/^Thành viên/) as HTMLTextAreaElement).value).toBe("Vũ\nvu");
    expect((screen.getByLabelText("Tên nhóm") as HTMLInputElement).value).toBe("Đà Lạt");
  });

  it("trùng tên trưởng nhóm và nhiều tên trùng: liệt kê trên cùng một dòng lỗi", () => {
    const f = renderForm();
    f.fill("Đà Lạt", "Thân", "thân\nVũ\nvu");
    expect(screen.getByTestId("group-error").textContent).toBe("Có 2 người tên “Thân” trùng nhau; Có 2 người tên “Vũ” trùng nhau");
  });

  it("gỡ tên trùng thì hết lỗi và tạo được", async () => {
    const f = renderForm();
    f.fill("Đà Lạt", "Thân", "Vũ\nvu");
    fireEvent.change(screen.getByLabelText(/^Thành viên/), { target: { value: "Vũ\nVương" } });
    expect(screen.queryByTestId("group-error")).toBeNull();
    f.submit();
    await waitFor(() => expect(createGroup).toHaveBeenCalledTimes(1));
  });

  it("quá số người tối đa: đếm báo lỗi, chặn nút Tạo", () => {
    const f = renderForm();
    f.fill("Đông", "Thân", Array.from({ length: 50 }, (_, i) => `Khách ${i + 1}`).join("\n"));
    expect(screen.getByTestId("member-count").textContent).toBe("51 người");
    expect(screen.getByTestId("group-error").textContent).toBe("Nhóm tối đa 50 người.");
    expect((screen.getByRole("button", { name: "Tạo" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
