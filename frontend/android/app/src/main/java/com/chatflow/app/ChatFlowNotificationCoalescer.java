package com.chatflow.app;

import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Debounces tray updates per {@code group_key} so two FCM messages in quick succession
 * produce one heads-up and one MessagingStyle entry (OEMs often pop twice on back-to-back notify).
 */
final class ChatFlowNotificationCoalescer {

    private static final long DEBOUNCE_MS = 120L;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final ConcurrentHashMap<String, Runnable> PENDING = new ConcurrentHashMap<>();

    interface Flush {
        void run();
    }

    private ChatFlowNotificationCoalescer() {}

    static void schedule(String groupKey, Flush flush) {
        if (groupKey == null || groupKey.isEmpty() || flush == null) {
            return;
        }
        Runnable existing = PENDING.remove(groupKey);
        if (existing != null) {
            MAIN.removeCallbacks(existing);
        }
        Runnable runnable =
                () -> {
                    PENDING.remove(groupKey);
                    flush.run();
                };
        PENDING.put(groupKey, runnable);
        MAIN.postDelayed(runnable, DEBOUNCE_MS);
    }

    static void cancel(String groupKey) {
        if (groupKey == null || groupKey.isEmpty()) {
            return;
        }
        Runnable existing = PENDING.remove(groupKey);
        if (existing != null) {
            MAIN.removeCallbacks(existing);
        }
    }
}
