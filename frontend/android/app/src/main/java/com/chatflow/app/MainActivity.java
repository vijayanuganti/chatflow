package com.chatflow.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.content.Intent;
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
    /** @deprecated Use {@link ChatFlowNotificationHelper#CHANNEL_ID}. */
    public static final String HIGH_IMPORTANCE_CHANNEL_ID = ChatFlowNotificationHelper.CHANNEL_ID;

    private void createNotificationChannel() {
        ChatFlowNotificationHelper.ensureActionsChannel(this);
        Log.i(TAG, "Notification channel ready: " + ChatFlowNotificationHelper.CHANNEL_ID);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ChatFlowNativePlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        ChatFlowNotificationHelper.ensureForegroundChannel(this);
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

    @Override
    public void onStart() {
        super.onStart();
        ChatFlowAppState.setAppForeground(this, true);
    }

    @Override
    public void onStop() {
        ChatFlowAppState.setAppForeground(this, false);
        super.onStop();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    public String getLaunchConversationId() {
        Intent intent = getIntent();
        if (intent == null) {
            return null;
        }
        return intent.getStringExtra(ChatFlowNotificationHelper.EXTRA_CONVERSATION_ID);
    }
}
