import { registerPlugin } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { getOrCreateBrowserId, getStoredAccessToken, getFcmApiBaseUrl, getApiBaseUrl } from "./api";
import { runLoggedOutNotificationGuard } from "./logoutCleanup";

const ChatFlowNative = registerPlugin("ChatFlowNative");

const PREFS_NAME = "chatflow_native_prefs";
const AUTH_TOKEN_KEY = "auth_token";

let appStateListener = null;

function resolveApiBase() {
  const base = getFcmApiBaseUrl() || getApiBaseUrl() || "";
  if (!base) return "";
  // Native OkHttp client expects …/api prefix (paths are /notifications/…).
  return base.endsWith("/api") ? base : `${base.replace(/\/$/, "")}/api`;
}

/**
 * Mirror JWT into Android SharedPreferences (`chatflow_native_prefs` / `auth_token`).
 * @returns {Promise<boolean>} true when native sync succeeded
 */
export async function syncNativeAuthForPush() {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  const token = getStoredAccessToken();
  if (!token) {
    console.warn("[nativeAuthSync] skip sync — no JWT in WebView storage");
    return false;
  }

  const apiBase = resolveApiBase();
  const browserId = getOrCreateBrowserId();

  try {
    await ChatFlowNative.syncAuth({
      token,
      auth_token: token,
      apiBase,
      browserId,
    });
    console.log("Token synced to native storage", {
      prefs: PREFS_NAME,
      key: AUTH_TOKEN_KEY,
      tokenLength: token.length,
      apiBase: apiBase || "(fallback in strings.xml)",
    });
    return true;
  } catch (err) {
    console.error("[nativeAuthSync] syncAuth bridge failed:", err);
    return false;
  }
}

/** Clear native credentials on logout. */
export async function clearNativeAuth() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ChatFlowNative.clearAuth();
    console.log("[nativeAuthSync] Cleared native auth_token");
  } catch (err) {
    console.warn("[nativeAuthSync] clearAuth failed:", err);
  }
}

/**
 * Re-sync JWT when the app returns to foreground (background replies need fresh native prefs).
 */
export function initNativeAuthSync() {
  if (!Capacitor.isNativePlatform()) return;

  if (!getStoredAccessToken()) {
    void runLoggedOutNotificationGuard();
    return;
  }

  void syncNativeAuthForPush();

  if (appStateListener) return;

  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      if (getStoredAccessToken()) {
        void syncNativeAuthForPush();
      } else {
        void runLoggedOutNotificationGuard();
      }
    }
  }).then((handle) => {
    appStateListener = handle;
  }).catch((err) => {
    console.warn("[nativeAuthSync] appStateChange listener failed:", err);
  });
}

export { ChatFlowNative };
