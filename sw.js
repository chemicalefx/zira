// App-shell cache. Model weights are cached separately by WebLLM (Cache Storage / IndexedDB).
const VERSION = "zira-v1";
const SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./models.js", "./worker.js",
  "./vendor/web-llm.js", "./manifest.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith("zira-") && k !== VERSION).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // let WebLLM handle model downloads
  // Network-first for HTML so updates arrive; cache-first for everything else.
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put("./index.html", copy)); return r; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return r;
    }))
  );
});
