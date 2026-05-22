import { Capacitor } from "@capacitor/core";
import { api, clearAuthSession, getStoredAccessToken } from "./api";
import { clearStoredActiveConversationId } from "./activeConversationStorage";
import { clearInAppNotificationState } from "./inAppNotifications";
import { clearNativeAuth } from "./nativeAuthSync";
import {
  cancelAllLocalNotifications,
  clearNotificationBadge,
  getDevicePushToken,
  teardownCapacitorPush,
  unregisterDevicePush,
  unregisterPushTokenFromServer,
} from "./push";

/**
 * Stop push + local + in-app notifications before auth is cleared.
 * Steps 1–3 run in parallel (server unregister, cancel local, device unregister).
 */
export async function runLogoutNotificationCleanup({ skipServer = false } = {}) {
  const pushToken = getDevicePushToken();
  const canCallServer = !skipServer && !!getStoredAccessToken() && !!pushToken;

  await Promise.all([
    canCallServer ? unregisterPushTokenFromServer(pushToken) : Promise.resolve(),
    cancelAllLocalNotifications(),
    unregisterDevicePush(),
  ]);

  teardownCapacitorPush();
  clearInAppNotificationState();
  await clearNotificationBadge();
}

/**
 * When the app opens without a session, ensure no push registration or tray alerts linger.
 */
export async function runLoggedOutNotificationGuard() {
  if (getStoredAccessToken()) return;
  await runLogoutNotificationCleanup({ skipServer: true });
  await clearNativeAuth();
}

/**
 * Full client sign-out after notification teardown (manual logout).
 */
export async function finalizeClientLogout() {
  clearAuthSession();
  clearStoredActiveConversationId();
  await clearNativeAuth();
}

/**
 * POST /auth/logout with device token (after notification teardown).
 */
export async function postServerLogout() {
  const pushToken = getDevicePushToken();
  try {
    await api.post("/auth/logout", pushToken ? { token: pushToken } : {});
  } catch {
    /* ignore */
  }
}
