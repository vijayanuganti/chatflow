import { Capacitor } from "@capacitor/core";
import { ChatFlowNative } from "./nativeAuthSync";

const STORAGE_KEY = "cf_conversation_sounds_enabled";

let cachedEnabled = true;

export function getConversationSoundsEnabled() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "0" || v === "false") return false;
    if (v === "1" || v === "true") return true;
  } catch {
    /* ignore */
  }
  return cachedEnabled;
}

/**
 * Persist to localStorage and {@code chatflow_native_prefs} on native.
 * @param {boolean} enabled
 */
export async function setConversationSoundsEnabled(enabled) {
  const on = !!enabled;
  cachedEnabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ChatFlowNative.setConversationSoundsEnabled({ enabled: on });
  } catch (err) {
    console.warn("[conversationSounds] native set failed:", err);
  }
}

/** Load preference from native prefs (authoritative on Android). */
export async function syncConversationSoundsFromNative() {
  if (!Capacitor.isNativePlatform()) return getConversationSoundsEnabled();
  try {
    const res = await ChatFlowNative.getConversationSoundsEnabled();
    if (typeof res?.enabled === "boolean") {
      cachedEnabled = res.enabled;
      try {
        localStorage.setItem(STORAGE_KEY, res.enabled ? "1" : "0");
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn("[conversationSounds] native get failed:", err);
  }
  return getConversationSoundsEnabled();
}
