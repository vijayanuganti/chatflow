import { registerPlugin } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { getOrCreateBrowserId, getStoredAccessToken } from "./api";
import { getFcmApiBaseUrl } from "./api";

const ChatFlowNative = registerPlugin("ChatFlowNative");

/**
 * Mirror JWT + API base into Android SharedPreferences for notification actions.
 */
export async function syncNativeAuthForPush() {
  if (!Capacitor.isNativePlatform()) return;
  const token = getStoredAccessToken();
  const apiBase = getFcmApiBaseUrl();
  const browserId = getOrCreateBrowserId();
  if (!token || !apiBase) return;
  try {
    await ChatFlowNative.syncAuth({
      token,
      auth_token: token,
      apiBase,
      browserId,
    });
  } catch (err) {
    console.warn("[nativeAuthSync] syncAuth failed:", err);
  }
}

export { ChatFlowNative };
