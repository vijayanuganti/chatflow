import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";
import {
  api,
  getFcmApiBaseUrl,
  getFcmTokenPostUrl,
  waitUntilAuthenticated,
} from "./api";
import {
  playInboundMessageTone,
  playConversationIncomingTone,
  playSoftForegroundTone,
  notificationToneSuppressesOsSound,
} from "./notificationTone";
import { markMessageSeen } from "./messageSeen";
import { showInAppMessageBanner } from "./inAppNotifications";
import {
  fcmGroupKeyForSender,
  shouldShowInAppAlert,
  shouldShowSystemTrayNotification,
  shouldSuppressAllNotifications,
} from "./notificationDisplay";
import { syncNativeAuthForPush, ChatFlowNative } from "./nativeAuthSync";

export const FCM_MESSAGE_EVENT = "chatflow:fcm-message";
export const NOTIFICATION_MARK_READ_EVENT = "chatflow:notification-mark-read";

export const FCM_CHANNEL_ID = "chatflow_messages_actions";

let activeUserId = null;
let listeners = [];
let onNotificationActionRef = null;
let onMarkReadRef = null;
let lastRegistrationToken = null;
let appResumeListener = null;

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
  // Channel is created in native Java (ChatFlowNotificationHelper) with action-button support.
  if (Capacitor.getPlatform() === "android") {
    logPush("Android notification channel managed natively:", FCM_CHANNEL_ID);
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
  lastRegistrationToken = token;
  console.log(`DEBUG_TOKEN_VAL: ${token.value}`);
  logPush("FCM registration received, length=", token.value.length);
  void postFcmTokenToApi(token);
}

async function refreshFcmRegistration(reason) {
  if (!Capacitor.isNativePlatform() || !activeUserId) return;
  logPush("refreshFcmRegistration:", reason);
  try {
    await syncNativeAuthForPush();
    await PushNotifications.register();
    if (lastRegistrationToken?.value) {
      void postFcmTokenToApi(lastRegistrationToken);
    }
  } catch (err) {
    console.warn("[push] refreshFcmRegistration failed:", err);
  }
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
  if (appResumeListener) {
    try {
      appResumeListener.remove();
    } catch {
      /* ignore */
    }
    appResumeListener = null;
  }
  activeUserId = null;
  onNotificationActionRef = null;
  onMarkReadRef = null;
  lastRegistrationToken = null;
}

/**
 * Request push permission, register with FCM, and POST the device token to the API.
 * Native (Capacitor) only — web continues to use the service worker in notify.js.
 */
export async function initCapacitorPush(userId, onNotificationAction, onMarkRead) {
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
  onMarkReadRef = onMarkRead;

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

  await syncNativeAuthForPush();

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
    // Log only — never call removeAllDeliveredNotifications / removeDeliveredNotifications here.
    await PushNotifications.addListener("pushNotificationReceived", async (notification) => {
      const data = notification?.data || {};
      const convId = data.conversation_id ? String(data.conversation_id) : "";
      const senderId = data.sender_id ? String(data.sender_id) : "";
      if (activeUserId && senderId && senderId === String(activeUserId)) {
        logPush("pushNotificationReceived: skip self-sent echo");
        return;
      }
      const title = notification?.title || data.title || "ChatFlow";
      const body = notification?.body || data.body || "";
      const suppressAll = shouldSuppressAllNotifications(convId);
      const showTray = shouldShowSystemTrayNotification();
      const showInApp = shouldShowInAppAlert(convId);
      const groupKey = fcmGroupKeyForSender(senderId, convId);

      logPush(
        "pushNotificationReceived:",
        notification?.id ?? title,
        "groupKey=",
        groupKey,
        "visible=",
        document.visibilityState,
        "suppressAll=",
        suppressAll,
        "showTray=",
        showTray,
        "showInApp=",
        showInApp,
      );

      if (showTray) {
        logPush("background — native tray handles OS notification; skip JS UI");
        if (notificationToneSuppressesOsSound()) {
          void playInboundMessageTone();
        }
      }

      try {
        window.dispatchEvent(
          new CustomEvent(FCM_MESSAGE_EVENT, {
            detail: {
              notification,
              data,
              inActiveChat: suppressAll,
              foreground: !showTray,
            },
          }),
        );
      } catch {
        /* ignore */
      }

      if (suppressAll) {
        if (data.message_id) markMessageSeen(data.message_id);
        return;
      }

      if (showTray) {
        return;
      }

      if (showInApp) {
        void playSoftForegroundTone();
        showInAppMessageBanner({
          title,
          body,
          conversationId: convId,
          onOpen: () => {
            onNotificationActionRef?.({
              data: { conversation_id: convId },
            });
          },
        });
      }
    }),
    await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
      const data = event?.notification?.data || {};
      if (data?.action === "mark_read" || event?.actionId === "mark_read") {
        onMarkReadRef?.({
          conversationId: data.conversation_id,
          messageId: data.message_id,
        });
        try {
          window.dispatchEvent(
            new CustomEvent(NOTIFICATION_MARK_READ_EVENT, {
              detail: {
                conversationId: data.conversation_id,
                messageId: data.message_id,
              },
            }),
          );
        } catch {
          /* ignore */
        }
        return;
      }
      onNotificationActionRef?.(event?.notification);
    }),
  );

  if (Capacitor.getPlatform() === "android") {
    try {
      listeners.push(
        await ChatFlowNative.addListener("markRead", (detail) => {
          onMarkReadRef?.(detail);
          try {
            window.dispatchEvent(
              new CustomEvent(NOTIFICATION_MARK_READ_EVENT, { detail }),
            );
          } catch {
            /* ignore */
          }
        }),
      );
    } catch (err) {
      console.warn("[push] ChatFlowNative markRead listener failed:", err);
    }
  }

  if (!appResumeListener) {
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        void refreshFcmRegistration("app foreground");
      }
    })
      .then((handle) => {
        appResumeListener = handle;
      })
      .catch((err) => {
        console.warn("[push] appStateChange listener failed:", err);
      });
  }

  logPush("listeners attached, calling PushNotifications.register()");
  try {
    await PushNotifications.register();
    logPush("PushNotifications.register() resolved");
  } catch (err) {
    console.error("[push] PushNotifications.register() threw:", err);
  }
}
