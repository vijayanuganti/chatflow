/** Lightweight pub/sub for foreground in-app message banners (WhatsApp-style dropdown). */

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
