/** Lightweight pub/sub for foreground in-app message banners (WhatsApp-style dropdown). */

export const IN_APP_BANNER_DISMISS_EVENT = "chatflow:dismiss-in-app-banner";

const listeners = new Set();

export function subscribeInAppMessageBanner(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * @param {{ title: string, body?: string, conversationId?: string, onOpen?: () => void }} payload
 */
export function showInAppMessageBanner(payload) {
  if (!payload?.title) return;
  listeners.forEach((fn) => {
    try {
      fn(payload);
    } catch {
      /* ignore */
    }
  });
}

/** Hide any visible banner on logout (keeps UI subscribers registered). */
export function dismissInAppMessageBanner() {
  try {
    window.dispatchEvent(new CustomEvent(IN_APP_BANNER_DISMISS_EVENT));
  } catch {
    /* ignore */
  }
}

/** Logout cleanup — dismiss tray only; do not clear subscribers (banner stays mounted). */
export function clearInAppNotificationState() {
  dismissInAppMessageBanner();
}
