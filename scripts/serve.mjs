// Server tĩnh tối giản cho thư mục `out/` — dùng để chạy thử bản build và cho e2e.
// Mô phỏng Vercel: `/ghi` → `/ghi/index.html`, nén gzip, header no-cache cho sw.js/manifest.
// `/api/*` được chuyển tiếp tới server API (`npm run dev:api`, mặc định cổng 3101) như Vercel Function.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request } from "node:http";
import { extname, join, normalize } from "node:path";
import { createGzip } from "node:zlib";

const ROOT = "out";
const PORT = Number(process.env.PORT ?? 3100);
const API_URL = new URL(process.env.API_URL ?? "http://localhost:3101");

const TYPES = {
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

function resolveFile(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, safe);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file) && !extname(file) && existsSync(file + ".html")) file += ".html";
  return existsSync(file) ? file : null;
}

function proxyToApi(req, res) {
  const upstream = request(
    { hostname: API_URL.hostname, port: API_URL.port, path: req.url, method: req.method, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "api_unavailable" }));
  });
  req.pipe(upstream);
}

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  if (pathname.startsWith("/api/")) return proxyToApi(req, res);
  const file = resolveFile(pathname);
  if (!file) {
    res.writeHead(404, { "content-type": TYPES[".html"] });
    createReadStream(join(ROOT, "404.html")).pipe(res);
    return;
  }
  const headers = { "content-type": TYPES[extname(file)] ?? "application/octet-stream" };
  if (pathname === "/sw.js" || pathname === "/manifest.webmanifest") headers["cache-control"] = "no-cache";
  else if (pathname.startsWith("/_next/static/")) headers["cache-control"] = "public, max-age=31536000, immutable";
  const compressible = /^(text\/|application\/(json|manifest))/.test(headers["content-type"]);
  if (compressible && /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")) {
    headers["content-encoding"] = "gzip";
    headers["vary"] = "Accept-Encoding";
    res.writeHead(200, headers);
    createReadStream(file).pipe(createGzip()).pipe(res);
    return;
  }
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Serving ${ROOT}/ at http://localhost:${PORT}`));
