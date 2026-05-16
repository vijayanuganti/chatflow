import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { ChatFlowNative } from "./nativeAuthSync";

let activeConversationId = null;
let inChatView = false;
let appForegroundListener = null;

export function getActiveConversationId() {
  return activeConversationId;
}

export function isInActiveConversation(conversationId) {
  if (!conversationId || !activeConversationId) return false;
  return String(activeConversationId) === String(conversationId);
}

/**
 * Sync which conversation the user is viewing (null = chat list or left chat).
 * @param {string | null | undefined} conversationId
 */
export async function setActiveChatState(conversationId) {
  const id = conversationId ? String(conversationId) : null;
  activeConversationId = id;
  inChatView = !!id;

  if (!Capacitor.isNativePlatform()) return;

  try {
    await ChatFlowNative.setActiveChat({
      inChat: inChatView,
      conversationId: id || "",
    });
    if (inChatView) {
      await ChatFlowNative.setAppForeground({ foreground: true }).catch(() => {});
    }
  } catch (err) {
    console.warn("[activeChatState] setActiveChat failed:", err);
  }
}

export async function clearActiveChatState() {
  await setActiveChatState(null);
}

/** Mirror native foreground flag from Capacitor App (backup for WebView lifecycle). */
export function initAppForegroundSync() {
  if (!Capacitor.isNativePlatform()) return;
  if (appForegroundListener) return;

  const sync = (isActive) => {
    ChatFlowNative.setAppForeground({ foreground: !!isActive }).catch(() => {});
  };

  App.getState()
    .then(({ isActive }) => sync(isActive))
    .catch(() => {});

  App.addListener("appStateChange", ({ isActive }) => sync(isActive))
    .then((handle) => {
      appForegroundListener = handle;
    })
    .catch((err) => {
      console.warn("[activeChatState] appStateChange listener failed:", err);
    });
}
