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
        String messageId = data != null ? data.get("message_id") : null;
        if (messageId != null && !messageId.isEmpty()) {
            ChatFlowApiClient.postUpdateStatusAsync(getApplicationContext(), messageId, "delivered");
        }

        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.i(TAG, "onNewToken len=" + (token != null ? token.length() : 0));
        PushNotificationsPlugin.onNewToken(token);
    }
}
