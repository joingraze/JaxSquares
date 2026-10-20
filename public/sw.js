// JaxSquares service worker: shows pushes, routes notification taps, and serves a
// tiny offline page when a navigation can't reach the network. It caches nothing,
// so a deploy is live on the next load and API responses are never stale.

const ICON = "/icons/icon-192.png";
const BADGE = "/icons/badge-96.png"; // monochrome status-bar icon (Android)

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#060c09"><title>Offline · JaxSquares</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#060c09;color:#f3f7f1;
font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:22px;margin:12px 0 6px}p{color:#94a3b8;margin:0 0 20px}
button{background:#22c55e;color:#06210f;border:0;border-radius:999px;padding:12px 22px;font-weight:700;font-size:16px}</style>
</head><body><main><div style="font-size:44px">🏈</div><h1>You're offline</h1>
<p>Your board will be right here when you're back.</p>
<button onclick="location.reload()">Try again</button></main>
<script>addEventListener("online",()=>location.reload())</script></body></html>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      self.registration.navigationPreload ? self.registration.navigationPreload.enable() : undefined,
    ]),
  );
});

// Network-first for page loads only; everything else (assets, /api/*) goes straight to the network.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) || (await fetch(req));
      } catch {
        return new Response(OFFLINE_HTML, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
      }
    })(),
  );
});

async function tellClients(message) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const w of windows) w.postMessage(message);
}

async function setBadge(count) {
  try {
    if (count > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(count);
  } catch {
    // Badging is a nicety; never let it block the notification.
  }
}

/** Only ever open our own pages. */
function appUrl(raw) {
  const url = new URL(typeof raw === "string" ? raw : "/", self.location.origin);
  return url.origin === self.location.origin ? url : new URL("/", self.location.origin);
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const tag = typeof data.tag === "string" && data.tag ? data.tag : undefined;
  const options = {
    body: data.body || "",
    icon: ICON,
    badge: BADGE,
    tag,
    renotify: Boolean(tag && data.renotify),
    silent: Boolean(data.quiet),
    timestamp: Date.now(),
    data: { url: appUrl(data.url).pathname, gameId: data.gameId || null, kind: data.kind || null },
  };
  // Always show it: iOS revokes push for web apps that receive pushes silently.
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || "JaxSquares", options),
      setBadge(Number(data.badge) || 0),
      tellClients({ type: "jaxsquares:push", payload: data }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = appUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const exact = windows.find((w) => new URL(w.url).pathname === target.pathname);
      if (exact) return exact.focus();
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        // Route inside the running app (no reload); src/lib/push.ts listens for this.
        const focused = await open.focus();
        (focused || open).postMessage({ type: "jaxsquares:navigate", url: target.pathname + target.search });
        return focused;
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});

// The browser rotated the subscription: open pages re-register it.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(tellClients({ type: "jaxsquares:resubscribe" }));
});
