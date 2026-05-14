/* ChatFlow service worker — keeps Chrome-style OS notifications working on
   Android Chrome (where `new Notification()` from the page is not permitted).

   This worker is intentionally minimal: it does not implement any caching
   strategy, and it does not subscribe to push. The page (when running)
   calls `registration.showNotification(...)` over the active SW to surface
   a native notification; the SW just handles the click/close lifecycle. */

const CHATFLOW_TAG_PREFIX = "chatflow-msg-";

self.addEventListener("install", (event) => {
  // Activate this version as soon as it's installed — there's nothing else
  // to do on install (no precache, no offline shell yet).
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  // Take control of all clients (open tabs) immediately so the very first
  // page load after registering gets a controller and can use showNotification.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      // If the app is already open in any tab, focus it and let it route.
      try {
        await client.focus();
        if ("navigate" in client && targetUrl) {
          try { await client.navigate(targetUrl); } catch { /* same-origin only */ }
        }
        if (event.notification.data) {
          client.postMessage({
            type: "chatflow:notification-click",
            data: event.notification.data,
          });
        }
        return;
      } catch {
        // try next client
      }
    }
    // No tab open — open a new one at the target (must be absolute for some WebViews).
    if (self.clients.openWindow) {
      let openUrl = targetUrl;
      try {
        openUrl = new URL(targetUrl, self.location.origin).href;
      } catch {
        /* keep targetUrl */
      }
      await self.clients.openWindow(openUrl);
    }
  })());
});

self.addEventListener("message", (event) => {
  // Allow the page to ping the SW (useful for future debugging).
  if (event.data === "chatflow:ping") {
    event.source && event.source.postMessage("chatflow:pong");
  }
});

// Re-export the constant so debug tooling can see it.
self.CHATFLOW_TAG_PREFIX = CHATFLOW_TAG_PREFIX;
