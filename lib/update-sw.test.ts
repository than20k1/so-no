import { afterEach, describe, expect, it, vi } from "vitest";
import { applyUpdate, holdUpdates, markArrival, setSafe, updateStore } from "./update";
import { ACTIVATE_TIMEOUT_MS, CHECK_THROTTLE_MS, checkForUpdate, getVersion, initUpdates, resetUpdatesForTests } from "./update-sw";

class FakeWorker extends EventTarget {
  constructor(public state: ServiceWorkerState = "installing") {
    super();
  }
  postMessage = vi.fn((msg: { type: string }, ports?: MessagePort[]) => {
    if (msg.type === "GET_VERSION") ports?.[0].postMessage("abc123");
  });
  setState(s: ServiceWorkerState) {
    this.state = s;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  active: FakeWorker | null = new FakeWorker("activated");
  update = vi.fn(async () => {});
  /** Server có bản mới: bắt đầu cài, xong thì nằm chờ. */
  startInstall(): FakeWorker {
    const w = new FakeWorker("installing");
    this.installing = w;
    this.dispatchEvent(new Event("updatefound"));
    return w;
  }
  finishInstall(w: FakeWorker) {
    this.installing = null;
    this.waiting = w;
    w.setState("installed");
  }
}

class FakeContainer extends EventTarget {
  controller: FakeWorker | null;
  constructor(
    public reg: FakeRegistration,
    controlled = true,
  ) {
    super();
    this.controller = controlled ? new FakeWorker("activated") : null;
  }
  register = vi.fn(async () => this.reg);
  /** SW mới được bật (skipWaiting + clients.claim). */
  activateWaiting() {
    const w = this.reg.waiting ?? this.reg.installing;
    this.reg.waiting = null;
    this.reg.installing = null;
    this.reg.active = w;
    this.controller = w;
    this.dispatchEvent(new Event("controllerchange"));
  }
}

async function setup(opts: { controlled?: boolean; waiting?: boolean } = {}) {
  const reg = new FakeRegistration();
  if (opts.waiting) reg.waiting = new FakeWorker("installed");
  const c = new FakeContainer(reg, opts.controlled ?? true);
  const reload = vi.fn();
  let t = 1_000_000;
  const clock = { advance: (ms: number) => (t += ms) };
  await initUpdates({ container: c as unknown as ServiceWorkerContainer, reload, now: () => t });
  return { reg, c, reload, clock };
}

function touch() {
  window.dispatchEvent(new Event("pointerdown"));
}

function returnToApp() {
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => resetUpdatesForTests());

describe("cập nhật phiên bản", () => {
  it("có bản mới chờ sẵn lúc mở app, đang ở màn an toàn → bật ngay rồi tải lại một lần", async () => {
    const { reg, c, reload } = await setup({ waiting: true });
    expect(updateStore.getState().waiting).toBe(true);
    expect(reg.waiting!.postMessage).not.toHaveBeenCalled(); // chưa có màn nào khai báo an toàn

    setSafe(true);
    expect(reg.waiting!.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    c.activateWaiting();
    c.dispatchEvent(new Event("controllerchange")); // bắn lặp cũng chỉ tải lại một lần
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("bản mới cài xong sau khi người dùng đã thao tác → không tự tải lại, chỉ báo", async () => {
    const { reg } = await setup();
    setSafe(true);
    touch();
    const w = reg.startInstall();
    reg.finishInstall(w);
    expect(updateStore.getState().waiting).toBe(true);
    expect(w.postMessage).not.toHaveBeenCalled();
  });

  it("đang ở form (không an toàn) → không tự bật dù vừa mở app; bấm Cập nhật thì bật và tải lại", async () => {
    const { reg, c, reload } = await setup({ waiting: true });
    setSafe(false);
    expect(reg.waiting!.postMessage).not.toHaveBeenCalled();

    applyUpdate();
    expect(reg.waiting!.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    c.activateWaiting();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("quay lại app ở màn an toàn khi đã có bản mới → tự áp dụng", async () => {
    const { reg } = await setup();
    setSafe(true);
    touch();
    const w = reg.startInstall();
    reg.finishInstall(w);
    expect(w.postMessage).not.toHaveBeenCalled();

    returnToApp();
    expect(w.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("quay lại app thì hỏi server, nhưng tối đa một lần mỗi 60 giây", async () => {
    const { reg, clock } = await setup();
    touch();
    returnToApp();
    expect(reg.update).not.toHaveBeenCalled(); // register() vừa hỏi rồi
    clock.advance(CHECK_THROTTLE_MS);
    returnToApp();
    expect(reg.update).toHaveBeenCalledTimes(1);
    returnToApp();
    expect(reg.update).toHaveBeenCalledTimes(1);
  });

  it("lần cài đầu (trang chưa có SW điều khiển) không bị coi là cập nhật", async () => {
    const { reg, c, reload } = await setup({ controlled: false });
    const w = reg.startInstall();
    reg.finishInstall(w);
    c.activateWaiting();
    expect(updateStore.getState()).toMatchObject({ waiting: false, stale: false });
    expect(reload).not.toHaveBeenCalled();
  });

  it("tab khác bật bản mới trong lúc tab này đang nhập → không tải lại, báo trang đã cũ", async () => {
    const { reg, c, reload } = await setup();
    touch();
    reg.finishInstall(reg.startInstall());
    c.activateWaiting();
    expect(reload).not.toHaveBeenCalled();
    expect(updateStore.getState().stale).toBe(true);

    applyUpdate();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("Kiểm tra bản mới: mới nhất / có bản mới / mất mạng", async () => {
    const { reg } = await setup();
    touch();
    expect(await checkForUpdate()).toBe("latest");

    reg.update.mockImplementationOnce(async () => {
      const w = reg.startInstall();
      setTimeout(() => reg.finishInstall(w), 0);
    });
    expect(await checkForUpdate()).toBe("available");
    expect(updateStore.getState().waiting).toBe(true);

    resetUpdatesForTests();
    const again = await setup();
    again.reg.update.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await checkForUpdate()).toBe("offline");
  });

  it("vừa chuyển sang một màn chính khi đã có bản mới → tự áp dụng (không giữ lẫn hai bản)", async () => {
    const { reg } = await setup();
    setSafe(false); // đang ở màn khác, vd. form ghi nợ
    touch();
    const w = reg.startInstall();
    reg.finishInstall(w);
    expect(w.postMessage).not.toHaveBeenCalled();

    setSafe(true);
    markArrival();
    expect(w.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("toast Hoàn tác đang hiện → hoãn tự áp dụng tới khi toast đóng", async () => {
    const { reg } = await setup({ waiting: true });
    const release = holdUpdates();
    setSafe(true);
    expect(reg.waiting!.postMessage).not.toHaveBeenCalled();

    release();
    release(); // nhả hai lần không làm lệch bộ đếm
    expect(reg.waiting!.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("hỏi được mã phiên bản từ SW đang điều khiển", async () => {
    await setup();
    expect(await getVersion()).toBe("abc123");
  });

  describe("bản mới không được bật sau SKIP_WAITING", () => {
    afterEach(() => vi.useRealTimers());

    it("quá hạn mà chưa bật → tải lại dự phòng; khi bật xong tải lại thêm đúng một lần", async () => {
      vi.useFakeTimers();
      const { c, reload } = await setup({ waiting: true });
      applyUpdate();
      vi.advanceTimersByTime(ACTIVATE_TIMEOUT_MS - 1);
      expect(reload).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(reload).toHaveBeenCalledTimes(1);
      c.activateWaiting(); // lần tải dự phòng có thể treo giữa lúc bật → tải lại thêm đúng một lần
      expect(reload).toHaveBeenCalledTimes(2);
      c.dispatchEvent(new Event("controllerchange"));
      expect(reload).toHaveBeenCalledTimes(2);
    });

    it("bản mới bật đúng hạn → không tải lại dự phòng", async () => {
      vi.useFakeTimers();
      const { c, reload } = await setup({ waiting: true });
      applyUpdate();
      c.activateWaiting();
      expect(reload).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(ACTIVATE_TIMEOUT_MS * 2);
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("đã tải lại dự phòng một lần trong phiên mà vẫn kẹt → không tải lại nữa (không lặp vô hạn)", async () => {
      vi.useFakeTimers();
      sessionStorage.setItem("so-no:update-fallback", "1");
      const { reg, reload } = await setup({ waiting: true });
      expect(reg.waiting).not.toBeNull();
      applyUpdate();
      vi.advanceTimersByTime(ACTIVATE_TIMEOUT_MS * 2);
      expect(reload).not.toHaveBeenCalled();
    });
  });
});
