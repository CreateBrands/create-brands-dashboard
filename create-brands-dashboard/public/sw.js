/* WEB_PUSH_V1 + SHARE_TARGET_V2 */
const SW_VERSION = "2026-06-14-sharetarget-v2";

self.addEventListener("install", (event) => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  event.waitUntil(self.registration.showNotification(data.title || "Chocoberry", {
    body: data.body || "",
    icon: "/logo192.png",
    badge: "/logo192.png",
    tag: data.tag || undefined,
    data: { linkView: data.linkView || null, url: data.url || "/" },
    vibrate: [120, 60, 120],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const linkView = event.notification.data && event.notification.data.linkView;
  const targetUrl = linkView ? "/?view=" + encodeURIComponent(linkView) : "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if ("focus" in client) { client.focus(); if (linkView && "navigate" in client) client.navigate(targetUrl).catch(() => {}); return; }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  }));
});

const SHARE_CACHE = "cb-shared-file";
const SHARE_KEY = "/__shared_statement";

self.addEventListener("fetch", (event) => {
  let url;
  try { url = new URL(event.request.url); } catch (e) { return; }
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith((async () => {
      try {
        const form = await event.request.formData();
        const file = form.get("statement");
        if (file && file.name) {
          const cache = await caches.open(SHARE_CACHE);
          const headers = new Headers();
          headers.set("Content-Type", file.type || "application/octet-stream");
          headers.set("X-Shared-Filename", encodeURIComponent(file.name));
          await cache.put(SHARE_KEY, new Response(file, { headers }));
        }
      } catch (e) {}
      return Response.redirect("/?share-target=1", 303);
    })());
    return;
  }
});

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "SKIP_WAITING") { self.skipWaiting(); return; }
  if (msg.type === "GET_VERSION") {
    const port = event.ports && event.ports[0];
    if (port) port.postMessage({ version: SW_VERSION });
    return;
  }
  if (msg.type === "GET_SHARED_FILE") {
    event.waitUntil((async () => {
      const port = event.ports && event.ports[0];
      try {
        const cache = await caches.open(SHARE_CACHE);
        const res = await cache.match(SHARE_KEY);
        if (!res) { if (port) port.postMessage({ ok: false }); return; }
        const name = decodeURIComponent(res.headers.get("X-Shared-Filename") || "statement.csv");
        const buf = await res.arrayBuffer();
        await cache.delete(SHARE_KEY);
        if (port) port.postMessage({ ok: true, name, buffer: buf }, [buf]);
      } catch (e) {
        if (port) port.postMessage({ ok: false, error: String(e) });
      }
    })());
  }
});