/* Suss service worker — offline app-shell caching only.
 * Caches static assets so the app (and offline pass & play) work without a
 * network. It never caches game data — there is none to cache; multiplayer
 * traffic is WebSocket (not handled here) and nothing is persisted. */

const CACHE = "suss-v2";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "words.js",
  "manifest.json",
  "terms.html",
  "privacy.html",
  "icon-192.png",
  "icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only handle same-origin GET; let everything else (incl. WS upgrades) pass.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin)
    return;
  // Network-first: always serve fresh code when online so deployed updates land
  // immediately; fall back to cache only when the network is unavailable.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req, { ignoreSearch: true })
          .then((cached) => cached || caches.match("index.html"))
      )
  );
});
