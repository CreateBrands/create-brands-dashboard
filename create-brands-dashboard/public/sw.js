/* WEB_PUSH_V1 + SHARE_TARGET_V3 */
const SW_VERSION = "2026-08-09-sharetarget-v3";

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
const SHARE_ERR_KEY = "/__shared_statement_error";

self.addEventListener("fetch", (event) => {
  let url;
  try { url = new URL(event.request.url); } catch (e) { return; }
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith((async () => {
      // SHARE_TARGET_V3 2026-08-09 — v2 read one fixed field ("statement") and
      // required file.name to be non-empty. Both assumptions are fragile:
      // Android share intents routinely deliver a stream with an empty name,
      // and the field name only matches while the manifest agrees with this
      // line. Either way the file was dropped, the redirect still happened, and
      // the app opened with nothing — which is exactly the reported symptom.
      // Now: take the first file-like part whatever it's called, invent a name
      // if the OS didn't give one, and record WHY when there's nothing usable.
      let why = "";
      try {
        const form = await event.request.formData();
        let file = null, fieldName = "";
        for (const [key, value] of form.entries()) {
          if (value && typeof value === "object" && typeof value.arrayBuffer === "function" && value.size > 0) {
            file = value; fieldName = key; break;
          }
        }
        if (!file) {
          const keys = [];
          for (const [k] of form.entries()) keys.push(k);
          why = keys.length
            ? "the share contained no file — fields received: " + keys.join(", ")
            : "the share arrived empty";
        } else {
          const type = file.type || "application/octet-stream";
          let name = file.name || "";
          if (!name) {
            const ext = /csv/i.test(type) ? "csv"
              : /sheet|excel|xls/i.test(type) ? "xlsx"
              : /pdf/i.test(type) ? "pdf" : "bin";
            name = "statement-" + Date.now() + "." + ext;
          }
          const cache = await caches.open(SHARE_CACHE);
          const headers = new Headers();
          headers.set("Content-Type", type);
          headers.set("X-Shared-Filename", encodeURIComponent(name));
          headers.set("X-Shared-Field", encodeURIComponent(fieldName));
          await cache.put(SHARE_KEY, new Response(file, { headers }));
        }
      } catch (e) {
        why = "couldn't read the shared data: " + String(e && e.message ? e.message : e);
      }
      if (why) {
        // Stash the reason so the app can say something better than nothing.
        try {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put(SHARE_ERR_KEY, new Response(why, { headers: { "Content-Type": "text/plain" } }));
        } catch (e2) {}
      }
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
        if (!res) {
          // Pass back the reason the POST handler recorded, if there was one.
          let why = "";
          try {
            const errRes = await cache.match(SHARE_ERR_KEY);
            if (errRes) { why = await errRes.text(); await cache.delete(SHARE_ERR_KEY); }
          } catch (e3) {}
          if (port) port.postMessage({ ok: false, error: why || "", version: SW_VERSION });
          return;
        }
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