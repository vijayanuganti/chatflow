/* ChatFlow service worker — keeps Chrome-style OS notifications working on
   Android Chrome (where `new Notification()` from the page is not permitted). */

const CHATFLOW_TAG_PREFIX = "chatflow-msg-";
const SUPPRESS_CHANNEL = "chatflow-push-suppress";

/** Conversation id the user is viewing (synced from the page). */
let activeConversationId = null;

function fcmGroupKey(data) {
  const senderId = data?.sender_id != null ? String(data.sender_id).trim() : "";
  if (senderId) return `sender_${senderId}`;
  const conversationId = data?.conversation_id != null ? String(data.conversation_id).trim() : "";
  if (conversationId) return `conv_${conversationId}`;
  const fromPayload = data?.group_key || data?.notification_tag;
  if (fromPayload) return String(fromPayload);
  return `msg_${Date.now()}`;
}

async function isViewingConversation(conversationId) {
  if (!conversationId) return false;
  const active = activeConversationId != null ? String(activeConversationId) : "";
  if (active && active === String(conversationId)) return true;

  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    if (client.visibilityState !== "visible") continue;
    try {
      const url = new URL(client.url);
      const c = url.searchParams.get("c");
      if (c && String(c) === String(conversationId)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

async function shouldSuppressTrayNotification(data) {
  const conversationId = data?.conversation_id != null ? String(data.conversation_id) : "";
  if (await isViewingConversation(conversationId)) return true;

  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return clients.some((c) => c.visibilityState === "visible");
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      try {
        await client.focus();
        if ("navigate" in client && targetUrl) {
          try {
            await client.navigate(targetUrl);
          } catch {
            /* same-origin only */
          }
        }
        if (event.notification.data) {
          client.postMessage({
            type: "chatflow:notification-click",
            data: event.notification.data,
          });
        }
        return;
      } catch {
        /* try next client */
      }
    }
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
  if (event.data === "chatflow:ping") {
    event.source && event.source.postMessage("chatflow:pong");
    return;
  }
  if (event.data?.type === "chatflow:active-chat") {
    activeConversationId =
      event.data.conversationId != null && event.data.conversationId !== ""
        ? String(event.data.conversationId)
        : null;
  }
});

try {
  const suppressChannel = new BroadcastChannel(SUPPRESS_CHANNEL);
  suppressChannel.onmessage = (event) => {
    if (event.data?.type === "chatflow:active-chat") {
      activeConversationId =
        event.data.conversationId != null && event.data.conversationId !== ""
          ? String(event.data.conversationId)
          : null;
    }
  };
} catch {
  /* BroadcastChannel unavailable */
}

/**
 * FCM / Web Push — data payload; page decides when to show tray (see notificationDisplay.js).
 */
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try {
      payload = event.data ? event.data.json() : {};
    } catch {
      payload = {};
    }
    const data = payload.data || payload;
    const title = data.title || payload.notification?.title || "ChatFlow";
    const body = data.body || payload.notification?.body || "";
    const conversationId = data.conversation_id != null ? String(data.conversation_id) : "";
    const senderId = data.sender_id != null ? String(data.sender_id) : "";
    const tag = fcmGroupKey(data);

    if (await shouldSuppressTrayNotification(data)) {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      clients.forEach((c) => {
        try {
          c.postMessage({ type: "chatflow:fcm-push", data });
        } catch {
          /* ignore */
        }
      });
      return;
    }

    const reg = self.registration;
    if (!reg || typeof reg.showNotification !== "function") return;

    await reg.showNotification(title, {
      body,
      tag,
      renotify: false,
      silent: false,
      data: {
        url: conversationId ? `/chat?c=${encodeURIComponent(conversationId)}` : "/chat",
        conversation_id: conversationId,
        sender_id: senderId,
        group_key: tag,
        message_id: data.message_id != null ? String(data.message_id) : "",
      },
      icon: "/favicon.svg",
      badge: "/favicon.svg",
    });
  })());
});

self.CHATFLOW_TAG_PREFIX = CHATFLOW_TAG_PREFIX;
