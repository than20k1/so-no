// Dựng app + PGlite + hộp thư bộ nhớ cho test tích hợp server (không mạng, không mail thật).
import { createApp } from "../app";
import type { Db } from "../db/client";
import { createPgliteDb } from "../db/pglite";
import { MemoryMailer } from "../mail";

export const ORIGIN = "http://localhost:3100";

export async function createHarness() {
  const db: Db = await createPgliteDb();
  const mailer = new MemoryMailer();
  const app = createApp({ db, mailer, secret: "t".repeat(32), baseURL: ORIGIN, testMode: true });
  return { db, mailer, app, client: () => new TestClient(app) };
}

/** Một "trình duyệt": tự giữ cookie giữa các request như fetch cùng origin. */
export class TestClient {
  private cookies = new Map<string, string>();
  constructor(private app: ReturnType<typeof createApp>) {}

  async request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.request(path, {
      method,
      headers: {
        origin: ORIGIN,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (value === "" || /max-age=0/i.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
  /** `fetch` giả dùng chung cookie của client này — để chạy code trình duyệt (lib/sync) nối thẳng vào server. */
  fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const res = await this.request(init.method ?? "GET", input, init.body ? JSON.parse(String(init.body)) : undefined);
    return new Response(res.body === null ? null : JSON.stringify(res.body), { status: res.status });
  };

  post(path: string, body: unknown = {}) {
    return this.request("POST", path, body);
  }
  get(path: string) {
    return this.request("GET", path);
  }
}
