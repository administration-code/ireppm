// IRep app service worker. Pages always come fresh from the network (rent, statements and
// documents must never be out of date); the offline page is shown only when there's no connection.
const CACHE = "irep-offline-v2";
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

// Phone notifications (new jobs, notices to serve). Tapping one opens the page it's about.
self.addEventListener("push", (e) => {
  let m = {};
  try {
    m = e.data ? e.data.json() : {};
  } catch {
    m = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(m.title || "IRep", {
      body: m.body || "",
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      tag: m.tag,
      requireInteraction: Boolean(m.urgent),
      data: { url: m.url || "/agent" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/agent", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.location.origin));
      if (open) return open.focus().then(() => open.navigate(url));
      return self.clients.openWindow(url);
    })
  );
});
