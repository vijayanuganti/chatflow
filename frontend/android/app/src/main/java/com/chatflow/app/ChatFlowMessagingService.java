package com.chatflow.app;

import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Sole FCM handler — posts notifications with action buttons, then notifies Capacitor JS.
 */
public class ChatFlowMessagingService extends FirebaseMessagingService {

    private static final String TAG = "ChatFlowFCMService";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Log.i(TAG, "onMessageReceived keys=" + remoteMessage.getData().keySet());

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        PowerManager.WakeLock wakeLock = null;
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ChatFlow:FCM");
            wakeLock.acquire(15_000L);
        }

        try {
            handleRemoteMessage(remoteMessage);
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        }
    }

    private void handleRemoteMessage(@NonNull RemoteMessage remoteMessage) {
        java.util.Map<String, String> data = remoteMessage.getData();
        android.content.Context appCtx = getApplicationContext();
        String incomingChatId = ChatFlowFcmData.get(data, "conversation_id", "conversationId");
        String activeChatId = ChatFlowAuthStore.getActiveConversationId(appCtx);
        boolean foreground = ChatFlowAppState.isAppForeground(appCtx);
        boolean suppressActiveChat =
                foreground
                        && activeChatId != null
                        && !activeChatId.isEmpty()
                        && incomingChatId != null
                        && activeChatId.equals(incomingChatId.trim());

        Log.i(
                TAG,
                "foreground="
                        + foreground
                        + " activeChatId="
                        + activeChatId
                        + " incomingChatId="
                        + incomingChatId
                        + " suppressActiveChat="
                        + suppressActiveChat);

        String messageId = extractMessageId(data);

        if (suppressActiveChat) {
            ChatFlowConversationSound.maybePlayIncoming(appCtx);
            if (messageId != null && !messageId.isEmpty()) {
                postDeliveredReceiptSync(messageId);
                postSeenReceiptSync(messageId);
            }
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
            return;
        }

        if (foreground) {
            Log.i(TAG, "App foreground — skip OS tray; WebView handles in-app alerts");
            if (messageId != null && !messageId.isEmpty()) {
                postDeliveredReceiptSync(messageId);
            }
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
            return;
        }

        String title = ChatFlowFcmData.get(data, "title");
        String groupKey =
                ChatFlowNotificationHelper.resolveThreadKey(
                        data, messageId, incomingChatId, title);
        Log.i(
                TAG,
                "App background — posting tray group_key="
                        + groupKey
                        + " conversation_id="
                        + incomingChatId);
        ChatFlowNotificationHelper.showFromFcm(appCtx, remoteMessage);
        Log.i(
                TAG,
                "delivered receipt message_id="
                        + (messageId != null ? messageId : "NULL")
                        + " fcm_keys="
                        + (data != null ? data.keySet() : "null"));
        if (messageId != null && !messageId.isEmpty()) {
            postDeliveredReceiptSync(messageId);
        } else {
            Log.w(TAG, "skipping /update-status: message_id missing from FCM data payload");
        }
        // Background: tray already shown natively — do not forward to Capacitor (avoids duplicate handling).
    }

    private void postSeenReceiptSync(final String messageId) {
        Thread worker =
                new Thread(
                        () -> {
                            Thread.currentThread().setPriority(Thread.MAX_PRIORITY);
                            Log.i(TAG, "update-status seen start message_id=" + messageId);
                            boolean ok =
                                    ChatFlowApiClient.postUpdateStatusUrgent(
                                            getApplicationContext(), messageId, "seen");
                            Log.i(
                                    TAG,
                                    "update-status seen done message_id="
                                            + messageId
                                            + " ok="
                                            + ok);
                        },
                        "ChatFlow-Seen");
        worker.setPriority(Thread.MAX_PRIORITY);
        worker.start();
    }

    /**
     * OPPO/Vivo etc. can kill the FCM process quickly — run a blocking OkHttp {@code execute()}
     * on a dedicated max-priority thread so the delivery receipt finishes before suspend.
     */
    private void postDeliveredReceiptSync(final String messageId) {
        Thread worker =
                new Thread(
                        () -> {
                            Thread.currentThread().setPriority(Thread.MAX_PRIORITY);
                            Log.i(TAG, "update-status thread start message_id=" + messageId);
                            boolean ok =
                                    ChatFlowApiClient.postUpdateStatusUrgent(
                                            getApplicationContext(), messageId, "delivered");
                            Log.i(
                                    TAG,
                                    "update-status thread done message_id="
                                            + messageId
                                            + " ok="
                                            + ok);
                        },
                        "ChatFlow-Delivered");
        worker.setPriority(Thread.MAX_PRIORITY);
        worker.start();
    }

    private void showSoftFromFcm(RemoteMessage remoteMessage) {
        java.util.Map<String, String> data = remoteMessage.getData();
        String messageId = extractMessageId(data);
        String conversationId = data != null ? data.get("conversation_id") : null;
        if (ChatFlowAppState.shouldSuppressForActiveChat(getApplicationContext(), conversationId)) {
            Log.i(TAG, "showSoftFromFcm blocked — user in active chat");
            return;
        }
        String title = data != null ? data.get("title") : null;
        String body = data != null ? data.get("body") : null;
        String avatarUrl = data != null ? data.get("sender_avatar_url") : null;
        RemoteMessage.Notification notification = remoteMessage.getNotification();
        if (title == null || title.isEmpty()) {
            title = notification != null && notification.getTitle() != null
                    ? notification.getTitle()
                    : "ChatFlow";
        }
        if (body == null) {
            body = notification != null && notification.getBody() != null
                    ? notification.getBody()
                    : "";
        }
        if (messageId == null || messageId.isEmpty()) {
            messageId = remoteMessage.getMessageId();
        }
        if (messageId == null || messageId.isEmpty()) {
            messageId = java.util.UUID.randomUUID().toString();
        }
        ChatFlowNotificationHelper.showMessageSoft(
                getApplicationContext(),
                messageId,
                conversationId,
                title,
                body,
                avatarUrl);
    }

    private static String extractMessageId(java.util.Map<String, String> data) {
        if (data == null) {
            return null;
        }
        String id = data.get("message_id");
        if (id == null || id.isEmpty()) {
            id = data.get("messageId");
        }
        if (id == null || id.isEmpty()) {
            id = data.get("id");
        }
        return (id != null && !id.isEmpty()) ? id : null;
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.i(TAG, "onNewToken len=" + (token != null ? token.length() : 0));
        PushNotificationsPlugin.onNewToken(token);
    }
}
