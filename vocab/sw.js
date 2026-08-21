/* 單字本 service worker — 靜態殼快取，讓通勤沒網路時也能複習。
   改版時把 VERSION 加一，舊快取會在 activate 時清掉。 */
const VERSION = "v1";
const SHELL = "vocab-shell-" + VERSION;
const FONTS = "vocab-fonts-" + VERSION;
const KEEP = [SHELL, FONTS];

const SHELL_FILES = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Google Fonts:網址帶版本雜湊,不會變,直接 cache-first
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith((async () => {
      const c = await caches.open(FONTS);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone());
        return res;
      } catch (err) {
        return Response.error();
      }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // 頁面本身:network-first,這樣改版一上線就吃得到,離線才退回快取
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const c = await caches.open(SHELL);
          c.put("./index.html", res.clone());
        }
        return res;
      } catch (err) {
        const c = await caches.open(SHELL);
        return (await c.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  // 其他同源靜態檔:cache-first
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === "basic") {
        const c = await caches.open(SHELL);
        c.put(req, res.clone());
      }
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
