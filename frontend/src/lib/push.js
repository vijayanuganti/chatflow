import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import {
  api,
  getFcmApiBaseUrl,
  getFcmTokenPostUrl,
  waitUntilAuthenticated,
} from "./api";

export const FCM_CHANNEL_ID = "high_importance_channel";

let activeUserId = null;
let listeners = [];
let onNotificationActionRef = null;

function logPush(...args) {
  console.log("[push]", ...args);
}

function formatRegistrationError(err) {
  if (err == null) return "unknown";
  if (typeof err === "string") return err;
  if (typeof err.error === "string") return err.error;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function formatErrorBody(data) {
  if (data == null) return "(empty body)";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function logFcmPostFailure(err, fullUrl, status, data) {
  console.error(`[push] FCM token POST failed status=${status ?? "network"} url=${fullUrl}`);
  console.error(`[push] FCM token POST error body: ${formatErrorBody(data)}`);
  if (err?.message) {
    console.error(`[push] FCM token POST error message: ${err.message}`);
  }
}

async function ensureAndroidNotificationChannel() {
  if (Capacitor.getPlatform() !== "android") return;
  try {
    await PushNotifications.createChannel({
      id: FCM_CHANNEL_ID,
      name: "Messages",
      description: "New chat messages",
      importance: 5,
      visibility: 1,
      vibration: true,
    });
    logPush("Android notification channel ready:", FCM_CHANNEL_ID);
  } catch (err) {
    console.warn("[push] createChannel failed:", err);
  }
}

async function postFcmTokenToApi(token, attempt = 0) {
  const tokenValue = token?.value;
  if (!tokenValue) {
    console.warn("[push] postFcmTokenToApi: missing token.value", token);
    return;
  }

  try {
    await waitUntilAuthenticated({ maxWaitMs: 20000 });
  } catch {
    console.error("[push] cannot post FCM token — user not authenticated (no JWT in storage)");
    return;
  }

  const fullUrl = getFcmTokenPostUrl();
  const fcmApiBase = getFcmApiBaseUrl();
  const bakedMobile = process.env.REACT_APP_BACKEND_URL_MOBILE || "(unset in build)";

  if (!fullUrl || !fcmApiBase) {
    console.error(
      "[push] REACT_APP_BACKEND_URL_MOBILE is missing from this build. Set it in frontend/.env and run npm run build:mobile",
    );
    return;
  }

  const payload = { token: tokenValue };

  if (fullUrl.includes("/api/api/") || fullUrl.includes("//users")) {
    console.error("[push] Invalid FCM URL (double slash or /api/api):", fullUrl);
    return;
  }

  console.log(`POSTING TO: ${fullUrl}`);
  console.log(`[push] REACT_APP_BACKEND_URL_MOBILE (baked)= ${bakedMobile}`);
  console.log(`[push] FCM API base (native mobile env)= ${fcmApiBase}`);

  try {
    // Absolute URL so the request interceptor cannot override with a relative /api base.
    const res = await api.post(fullUrl, payload, {
      headers: { "Content-Type": "application/json" },
    });

    if (res.status !== 200) {
      console.error(
        `[push] FCM token POST non-200 status=${res.status} body=${formatErrorBody(res.data)}`,
      );
      return;
    }

    logPush("FCM token saved to API", res.status, res.data);
  } catch (err) {
    logFcmPostFailure(err, fullUrl, err?.response?.status, err?.response?.data);
    if (attempt < 5) {
      window.setTimeout(() => postFcmTokenToApi(token, attempt + 1), 1500);
    }
  }
}

function onRegistration(token) {
  if (!token?.value) {
    console.warn("[push] registration event with empty token:", token);
    return;
  }
  console.log(`DEBUG_TOKEN_VAL: ${token.value}`);
  logPush("FCM registration received, length=", token.value.length);
  void postFcmTokenToApi(token);
}

function onRegistrationError(err) {
  const msg = formatRegistrationError(err);
  console.error("[push] registrationError:", msg, err);
}

export function teardownCapacitorPush() {
  listeners.forEach((handle) => {
    try {
      handle.remove();
    } catch {
      /* ignore */
    }
  });
  listeners = [];
  activeUserId = null;
  onNotificationActionRef = null;
}

/**
 * Request push permission, register with FCM, and POST the device token to the API.
 * Native (Capacitor) only — web continues to use the service worker in notify.js.
 */
export async function initCapacitorPush(userId, onNotificationAction) {
  if (!userId || !Capacitor.isNativePlatform()) {
    logPush("skip init", { userId: !!userId, native: Capacitor.isNativePlatform() });
    return;
  }

  const fcmUrl = getFcmTokenPostUrl();
  if (!fcmUrl) {
    console.error(
      "[push] Cannot init FCM — REACT_APP_BACKEND_URL_MOBILE not baked into build. Rebuild with frontend/.env set.",
    );
    return;
  }

  onNotificationActionRef = onNotificationAction;

  if (activeUserId === userId && listeners.length > 0) {
    logPush("already initialized for user", userId);
    return;
  }

  teardownCapacitorPush();
  activeUserId = userId;

  logPush(
    "init for user",
    userId,
    "MOBILE_ENV=",
    process.env.REACT_APP_BACKEND_URL_MOBILE,
    "FCM_URL=",
    fcmUrl,
  );

  try {
    await waitUntilAuthenticated({ maxWaitMs: 20000 });
    logPush("JWT available — safe to register FCM");
  } catch {
    console.error("[push] aborting FCM init — not authenticated yet");
    return;
  }

  await ensureAndroidNotificationChannel();

  const perm = await PushNotifications.checkPermissions();
  logPush("checkPermissions.receive =", perm.receive);

  let receive = perm.receive;
  if (receive === "prompt") {
    const req = await PushNotifications.requestPermissions();
    receive = req.receive;
    logPush("requestPermissions.receive =", receive);
  }

  if (receive !== "granted") {
    console.warn("[push] notification permission not granted:", receive);
  }

  listeners.push(
    await PushNotifications.addListener("registration", onRegistration),
    await PushNotifications.addListener("registrationError", onRegistrationError),
    await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
      onNotificationActionRef?.(event?.notification);
    }),
  );

  logPush("listeners attached, calling PushNotifications.register()");
  try {
    await PushNotifications.register();
    logPush("PushNotifications.register() resolved");
  } catch (err) {
    console.error("[push] PushNotifications.register() threw:", err);
  }
}
