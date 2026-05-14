/**
 * Browser notifications wrapper.
 *
 * Why this file exists: on Android Chrome `new Notification()` from a page
 * throws (`Failed to construct 'Notification': Illegal constructor.`). The
 * only supported path is `ServiceWorkerRegistration.showNotification()`. On
 * desktop Chrome both work, but going through the SW also gives us a uniform
 * click/focus flow (see public/sw.js).
 *
 * Usage:
 *   import { ensureNotificationPermission, showAppNotification } from "@/lib/notify";
 *   await ensureNotificationPermission();
 *   showAppNotification({ title: "New message", body: "Hi!", tag: "conv-123", url: "/chat" });
 */

function notificationIconUrl() {
  if (typeof window === "undefined" || !window.location?.origin) return "/favicon.svg";
  try {
    return new URL("/favicon.svg", window.location.origin).href;
  } catch {
    return "/favicon.svg";
  }
}

let _registration = null;
let _registrationPromise = null;

export function isNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission() {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Register the service worker (once) so we can route notifications through it.
 * Safe to call multiple times; resolves to the SW registration or null when
 * the browser doesn't support service workers.
 */
export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  if (_registration) return Promise.resolve(_registration);
  if (_registrationPromise) return _registrationPromise;
  const swPath =
    typeof process !== "undefined" && process.env && process.env.PUBLIC_URL
      ? `${String(process.env.PUBLIC_URL).replace(/\/$/, "")}/sw.js`
      : "/sw.js";

  _registrationPromise = navigator.serviceWorker
    .register(swPath)
    .then((reg) => {
      _registration = reg;
      return reg;
    })
    .catch((err) => {
      // Don't crash the app if SW registration fails (e.g. file://, CSP, etc).
      console.warn("[notify] SW registration failed:", err);
      return null;
    });
  return _registrationPromise;
}

/**
 * Ask the user for notification permission if we haven't already. Returns the
 * final permission string ("granted" | "denied" | "default" | "unsupported").
 */
export async function ensureNotificationPermission() {
  if (!isNotificationSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

/**
 * Surface a native Chrome-style notification.
 *
 * @param {Object} opts
 * @param {string} opts.title       Required notification title.
 * @param {string} [opts.body]      Notification body (preview text).
 * @param {string} [opts.tag]       Tag used to collapse repeat notifications
 *                                  from the same conversation. Pass the
 *                                  conversation id for chat messages so the
 *                                  newest one replaces older ones.
 * @param {string} [opts.url]       URL to open / focus on click. Defaults to "/".
 * @param {Object} [opts.data]      Extra payload available in the SW click handler.
 * @param {boolean} [opts.silent]   Suppress the notification sound.
 * @param {boolean} [opts.renotify] Re-alert (vibrate / sound) even if the tag
 *                                  matches an existing notification.
 */
export async function showAppNotification({
  title,
  body,
  tag,
  url = "/",
  data,
  silent = false,
  renotify = true,
} = {}) {
  if (!isNotificationSupported()) return false;
  if (Notification.permission !== "granted") return false;
  if (!title) return false;

  const iconAbs = notificationIconUrl();
  const payload = {
    body: body || "",
    icon: iconAbs,
    badge: iconAbs,
    tag: tag || undefined,
    renotify: tag ? renotify : false,
    silent,
    data: { url, ...(data || {}) },
    // vibration is best-effort; ignored on platforms that don't support it.
    vibrate: silent ? undefined : [80, 40, 80],
  };

  // Preferred path: route through the active service worker so Android Chrome
  // / WebView can show the notification. Wait for `ready` so the first alert
  // after cold start isn't lost while the worker is still installing.
  if ("serviceWorker" in navigator) {
    try {
      await registerServiceWorker();
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, payload);
        return true;
      }
    } catch (err) {
      console.warn("[notify] showNotification via SW failed:", err);
    }
  }

  // Desktop fallback when there's no SW (e.g. some Safari builds).
  try {
    const n = new Notification(title, payload);
    if (url) {
      n.onclick = () => {
        try { window.focus(); } catch { /* noop */ }
        try {
          if (window.location.pathname !== url) {
            window.location.assign(url);
          }
        } catch { /* noop */ }
        n.close();
      };
    }
    return true;
  } catch (err) {
    console.warn("[notify] Notification constructor failed:", err);
    return false;
  }
}
