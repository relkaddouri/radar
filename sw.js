// Radar — service worker: app shell from cache, data.json from network with offline fallback.
const VERSION = "radar-v8";
const SHELL = ["./","index.html","manifest.webmanifest","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin === location.origin && url.pathname.endsWith("/data.json")) {
    e.respondWith(fetch(e.request, {cache:"no-store"}).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put("data.json", copy)); return r; })
      .catch(() => caches.match("data.json").then(r => { if (!r) return new Response("{}", {status:503}); const h = new Headers(r.headers); h.set("x-radar-offline","1"); return r.blob().then(b => new Response(b,{status:200,headers:h})); })));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
    return;
  }
  // Google Fonts: cache after first load
  if (url.host.endsWith("googleapis.com") || url.host.endsWith("gstatic.com")) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; })));
  }
});
