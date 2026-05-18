import { Capacitor } from "@capacitor/core";
import { isInActiveConversation } from "./activeChatState";

/** @returns {boolean} App tab/window is visible (in-app, not minimized). */
export function isAppInForeground() {
  return typeof document !== "undefined" && document.visibilityState === "visible";
}

/**
 * True when the user is viewing the conversation that received the message.
 * No sound, banner, or system tray in this case.
 */
export function shouldSuppressAllNotifications(conversationId) {
  return isAppInForeground() && isInActiveConversation(conversationId);
}

/**
 * System tray / OS notification — only when the app is not in the foreground
 * (minimized, background tab, or screen locked).
 * Native (Capacitor): tray is owned by FCM → ChatFlowMessagingService only (never WebSocket SW).
 */
export function shouldShowSystemTrayNotification() {
  if (Capacitor.isNativePlatform()) {
    return false;
  }
  return !isAppInForeground();
}

/**
 * In-app banner (no OS tray) when the app is open but on another screen/chat.
 */
export function shouldShowInAppAlert(conversationId) {
  if (!isAppInForeground()) return false;
  return !isInActiveConversation(conversationId);
}

/**
 * One tray slot per sender — must match backend `_fcm_group_key` and Android `resolveThreadKey`.
 */
export function fcmGroupKeyForSender(senderId, conversationId) {
  const sid = senderId != null ? String(senderId).trim() : "";
  if (sid) return `sender_${sid}`;
  const cid = conversationId != null ? String(conversationId).trim() : "";
  if (cid) return `conv_${cid}`;
  return `msg_${Date.now()}`;
}

/** @deprecated alias */
export function notificationTagForThread({ senderId, conversationId } = {}) {
  return fcmGroupKeyForSender(senderId, conversationId);
}

const SW_SUPPRESS_CHANNEL = "chatflow-push-suppress";

function postActiveChatToServiceWorker(conversationId) {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return;
  try {
    navigator.serviceWorker.controller.postMessage({
      type: "chatflow:active-chat",
      conversationId: conversationId != null ? String(conversationId) : null,
    });
  } catch {
    /* ignore */
  }
}

/** Tell the service worker which chat is open (suppress tray for that thread). */
export function broadcastActiveConversationForPush(conversationId) {
  postActiveChatToServiceWorker(conversationId);
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel(SW_SUPPRESS_CHANNEL);
    ch.postMessage({
      type: "chatflow:active-chat",
      conversationId: conversationId != null ? String(conversationId) : null,
    });
    ch.close();
  } catch {
    /* ignore */
  }
}
