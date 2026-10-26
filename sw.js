// App-shell cache. Kept deliberately tiny: the 6.6 MB WebLLM bundle is NOT precached
// (it's cached on first use when the user taps Load), and model weights / self-hosted
// model manifests are never touched here — WebLLM caches those itself.
const VERSION = "zira-v3";
const SHELL = [
  "./", "./index.html", "./styles.css", "./app.js", "./models.js", "./worker.js", "./manifest.json",
  "./icons/icon-192.png", "./icons/apple-touch-icon.png",
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
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/models/")) return; // WebLLM handles model files
  const put = (r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); } return r; };
  if (url.pathname.endsWith("/vendor/web-llm.js")) {
    // Big + versioned: cache-first, filled lazily.
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then(put)));
    return;
  }
  // Small shell files: network-first so updates land immediately; cache when offline.
  e.respondWith(
    fetch(e.request).then(put).catch(() =>
      caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match("./index.html")))
  );
});
