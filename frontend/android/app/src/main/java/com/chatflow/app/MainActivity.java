package com.chatflow.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Requests {@link Manifest.permission#POST_NOTIFICATIONS} on API 33+ so WebView
 * {@code ServiceWorkerRegistration.showNotification} can surface OS alerts.
 */
public class MainActivity extends BridgeActivity {

    private static final int REQ_POST_NOTIFICATIONS = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
