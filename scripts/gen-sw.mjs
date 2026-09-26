// Sinh `out/sw.js` sau `next build`: precache toàn bộ app shell, phục vụ cache-first để mở tức thì và chạy offline.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = "out";
const SKIP = new Set(["sw.js"]);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(OUT)
  .map((full) => ({ full, url: "/" + relative(OUT, full).split(sep).join("/") }))
  .filter(({ url }) => !SKIP.has(url.slice(1)))
  .sort((a, b) => a.url.localeCompare(b.url));

const hash = createHash("sha256");
for (const { url, full } of files) hash.update(url).update(readFileSync(full));
const version = hash.digest("hex").slice(0, 12);
const assets = files.map((f) => f.url);

const sw = `// Sinh tự động bởi scripts/gen-sw.mjs — không sửa tay.
const VERSION = ${JSON.stringify(version)};
const CACHE = "so-no-" + VERSION;
const ASSETS = ${JSON.stringify(assets)};

// Cài bản mới ngầm; KHÔNG skipWaiting — bản mới chỉ chạy ở lần mở app sau,
// để không tải lại trang khi người dùng đang ghi nợ.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" }))),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("so-no-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function htmlPath(pathname) {
  if (pathname.endsWith("/")) return pathname + "index.html";
  if (!/\\.[a-z0-9]+$/i.test(pathname)) return pathname + "/index.html";
  return pathname;
}

const MATCH = { ignoreSearch: true, ignoreVary: true };

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname === "/sw.js") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const key = req.mode === "navigate" ? htmlPath(url.pathname) : req;
      const hit = await cache.match(key, MATCH);
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch (err) {
        if (req.mode === "navigate") {
          const notFound = await cache.match("/404.html", MATCH);
          if (notFound) return notFound;
        }
        throw err;
      }
    })(),
  );
});
`;

writeFileSync(join(OUT, "sw.js"), sw);
console.log(`sw.js: phiên bản ${version}, precache ${assets.length} file`);
