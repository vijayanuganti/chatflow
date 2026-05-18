/** Persists the open chat thread across full-screen sub-routes (diet, medical, etc.). */

export const ACTIVE_CONV_STORAGE_KEY = "chatflow_active_conv";

export function getStoredActiveConversationId() {
  if (typeof window === "undefined") return null;
  try {
    const id = sessionStorage.getItem(ACTIVE_CONV_STORAGE_KEY);
    return id && String(id).trim() ? String(id).trim() : null;
  } catch {
    return null;
  }
}

export function setStoredActiveConversationId(conversationId) {
  if (typeof window === "undefined") return;
  try {
    if (conversationId) {
      sessionStorage.setItem(ACTIVE_CONV_STORAGE_KEY, String(conversationId));
    } else {
      sessionStorage.removeItem(ACTIVE_CONV_STORAGE_KEY);
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStoredActiveConversationId() {
  setStoredActiveConversationId(null);
}
