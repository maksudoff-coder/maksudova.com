/* Tutor Maksudova — app shell cache (makes the site installable and quick to open) */
const CACHE = "tm-1795282927";
const SHELL = ["/", "/fonts/onest.css", "/vendor/firebase-app-compat.js", "/vendor/firebase-auth-compat.js", "/vendor/firebase-firestore-compat.js", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;           // Firebase, fonts, videos: always live
  if (r.mode === "navigate") {                                              // the page itself: newest first, cached copy when offline
    e.respondWith(fetch(r).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put("/", copy)); return res; }).catch(() => caches.match("/")));
    return;
  }
  e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok && /\.(js|png|jpg|webp|woff2|css|webmanifest)$/.test(u.pathname)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); } return res; })));
});
