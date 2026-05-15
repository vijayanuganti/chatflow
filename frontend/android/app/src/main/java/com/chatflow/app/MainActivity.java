package com.chatflow.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Requests {@link Manifest.permission#POST_NOTIFICATIONS} on API 33+ so WebView
 * {@code ServiceWorkerRegistration.showNotification} can surface OS alerts.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "ChatFlowFCM";
    private static final int REQ_POST_NOTIFICATIONS = 1001;
    /** Must match FCM {@code channel_id} in backend/server.py. */
    public static final String HIGH_IMPORTANCE_CHANNEL_ID = "high_importance_channel";

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
                HIGH_IMPORTANCE_CHANNEL_ID,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("New chat messages");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        channel.setShowBadge(true);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.createNotificationChannel(channel);
            Log.i(
                    TAG,
                    "Notification channel created: "
                            + HIGH_IMPORTANCE_CHANNEL_ID
                            + " importance=IMPORTANCE_HIGH");
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        // Keep the WebView below the system status bar so CSS safe-area matches the visual chrome.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                        this,
                        new String[] { Manifest.permission.POST_NOTIFICATIONS },
                        REQ_POST_NOTIFICATIONS);
            }
        }
    }
}
