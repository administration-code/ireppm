// IRep app service worker. Pages always come fresh from the network (rent, statements and
// documents must never be out of date); the offline page is shown only when there's no connection.
const CACHE = "irep-offline-v1";
const OFFLINE = "/offline";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/brand/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // leave data, sign-in and files alone
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
