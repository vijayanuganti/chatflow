package com.chatflow.app;

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

        // Must run before Capacitor — we own the system notification with action buttons.
        ChatFlowNotificationHelper.showFromFcm(getApplicationContext(), remoteMessage);

        java.util.Map<String, String> data = remoteMessage.getData();
        String messageId = extractMessageId(data);
        Log.i(TAG, "delivered receipt message_id=" + (messageId != null ? messageId : "NULL")
                + " fcm_keys=" + (data != null ? data.keySet() : "null"));
        if (messageId != null && !messageId.isEmpty()) {
            postDeliveredReceiptSync(messageId);
        } else {
            Log.w(TAG, "skipping /update-status: message_id missing from FCM data payload");
        }

        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
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
