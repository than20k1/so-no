// Làm việc với service worker để cập nhật phiên bản app (design sua-cap-nhat-phien-ban D1, D2, D5, D6).
// Service worker mới chỉ được bật khi trang gửi SKIP_WAITING. Tải lười (không nằm trong gói JS màn chính).
import {
  canAutoApply,
  maybeAutoApply,
  resetUpdateStateForTests,
  setApplier,
  setOpportunity,
  setUpdateState,
  updateStore,
} from "./update";

export type CheckResult = "latest" | "available" | "offline";

/** Khoảng cách tối thiểu giữa hai lần tự hỏi server khi quay lại app. */
export const CHECK_THROTTLE_MS = 60_000;
/** Chờ bản mới được bật sau SKIP_WAITING; quá hạn thì tải lại trang (xem `reloadIfNotActivated`). */
export const ACTIVATE_TIMEOUT_MS = 2000;
const FALLBACK_KEY = "so-no:update-fallback";

let container: ServiceWorkerContainer | null = null;
let reg: ServiceWorkerRegistration | null = null;
let reload: () => void = () => window.location.reload();
let now: () => number = () => Date.now();
let applying = false;
let reloaded = false;
let lastCheck = 0;
let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
const cleanups: (() => void)[] = [];

function doReload() {
  clearTimeout(fallbackTimer);
  if (reloaded) return;
  reloaded = true;
  reload();
}

/**
 * Trình duyệt đôi khi không bật bản mới: nếu trang gửi request qua service worker cũ đúng lúc nó đang bị dừng
 * để nhường chỗ, worker cũ bị đánh thức lại và bản mới kẹt ở `installed` (gửi lại SKIP_WAITING cũng vô ích).
 * Tải lại trang thì bật được. Chỉ thử một lần mỗi phiên tab, tránh lặp vô hạn nếu vẫn không bật.
 * Không đặt cờ `reloaded`: lần tải này bắt đầu ngay lúc bản mới đang được bật nên có thể treo; `controllerchange`
 * ngay sau đó phải được tải lại thêm một lần, lần đó mới hoàn tất.
 */
function reloadIfNotActivated() {
  try {
    if (sessionStorage.getItem(FALLBACK_KEY)) return;
    sessionStorage.setItem(FALLBACK_KEY, "1");
  } catch {
    return;
  }
  reload();
}

function apply() {
  if (updateStore.getState().stale) return doReload();
  const w = reg?.waiting;
  if (!w) return;
  applying = true;
  w.postMessage({ type: "SKIP_WAITING" });
  clearTimeout(fallbackTimer);
  fallbackTimer = setTimeout(reloadIfNotActivated, ACTIVATE_TIMEOUT_MS);
}

/** Có bản mới chờ bật? Chỉ tính khi trang đang do một bản cũ điều khiển (lần cài đầu không phải cập nhật). */
function noteWaiting() {
  if (!reg?.waiting || !container?.controller) return;
  // Sắp tự bật và tải lại: không đặt `waiting` để UpdateBar không mount. Nó tải chunk qua service worker cũ
  // đúng lúc trình duyệt đang dừng worker đó để bật bản mới → worker cũ bị đánh thức lại, bản mới kẹt ở `installed`.
  if (canAutoApply()) apply();
  else setUpdateState({ waiting: true });
}

function watchInstalling(r: ServiceWorkerRegistration) {
  const w = r.installing;
  if (!w) return;
  w.addEventListener("statechange", () => {
    if (w.state === "installed") noteWaiting();
  });
}

function listen(target: EventTarget, type: string, fn: () => void, capture = false) {
  target.addEventListener(type, fn, capture);
  cleanups.push(() => target.removeEventListener(type, fn, capture));
}

/** Đăng ký service worker và bắt đầu theo dõi bản mới. Gọi một lần khi app mở. */
export async function initUpdates(
  opts: { container?: ServiceWorkerContainer; reload?: () => void; now?: () => number } = {},
): Promise<void> {
  container = opts.container ?? navigator.serviceWorker;
  if (opts.reload) reload = opts.reload;
  if (opts.now) now = opts.now;
  const c = container;
  let hadController = c.controller !== null;
  setApplier(apply);

  listen(c, "controllerchange", () => {
    // Lần cài đầu: SW mới gọi clients.claim() → không phải cập nhật.
    if (!hadController && !applying && !updateStore.getState().waiting) {
      hadController = true;
      return;
    }
    if (applying || canAutoApply()) doReload();
    else setUpdateState({ waiting: false, stale: true });
  });

  setOpportunity(true);
  const interacted = () => setOpportunity(false);
  listen(window, "pointerdown", interacted, true);
  listen(window, "keydown", interacted, true);
  listen(document, "visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    setOpportunity(true);
    maybeAutoApply();
    if (now() - lastCheck >= CHECK_THROTTLE_MS) void checkForUpdate();
  });

  reg = await c.register("/sw.js");
  lastCheck = now(); // register() tự hỏi server rồi
  if (!reg.waiting) {
    try {
      sessionStorage.removeItem(FALLBACK_KEY);
    } catch {}
  }
  reg.addEventListener("updatefound", () => watchInstalling(reg!));
  watchInstalling(reg);
  noteWaiting();
}

/** Hỏi server có bản mới không (nút "Kiểm tra bản mới", và khi quay lại app). */
export async function checkForUpdate(): Promise<CheckResult> {
  if (!reg) return "latest";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  lastCheck = now();
  try {
    await reg.update();
  } catch {
    return "offline";
  }
  const w = reg.installing;
  if (w) {
    await new Promise<void>((resolve) => {
      const done = () => {
        if (w.state === "installing") return;
        w.removeEventListener("statechange", done);
        resolve();
      };
      w.addEventListener("statechange", done);
      done();
    });
  }
  noteWaiting();
  const { waiting, stale } = updateStore.getState();
  return waiting || stale ? "available" : "latest";
}

/** Mã phiên bản của service worker đang điều khiển trang; `null` khi chưa có (dev, lần mở đầu). */
export function getVersion(timeoutMs = 1000): Promise<string | null> {
  const controller = container?.controller ?? (typeof navigator !== "undefined" ? navigator.serviceWorker?.controller : null);
  if (!controller) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(String(e.data));
    };
    controller.postMessage({ type: "GET_VERSION" }, [channel.port2]);
  });
}

/** Chỉ dùng trong test. */
export function resetUpdatesForTests(): void {
  cleanups.splice(0).forEach((f) => f());
  resetUpdateStateForTests();
  container = null;
  reg = null;
  reload = () => window.location.reload();
  now = () => Date.now();
  applying = false;
  reloaded = false;
  lastCheck = 0;
  clearTimeout(fallbackTimer);
  try {
    sessionStorage.removeItem(FALLBACK_KEY);
  } catch {}
}
