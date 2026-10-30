const CACHE = "second-brain-shell-v4";
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/ui.js",
  "/auth.js",
  "/local.js",
  "/sync.js",
  "/sharing.js",
  "/backup.js",
  "/digest.js",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("second-brain-shell-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const u = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    u.origin !== location.origin ||
    u.pathname.startsWith("/api/") ||
    u.pathname.startsWith("/shared")
  )
    return;
  if (!ASSETS.includes(u.pathname)) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
