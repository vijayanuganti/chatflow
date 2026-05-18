package com.chatflow.app;

import android.util.Log;
import java.util.Map;

/** Reads FCM data map keys (supports snake_case and camelCase). */
final class ChatFlowFcmData {

    private static final String TAG = "ChatFlowNotify";

    private ChatFlowFcmData() {}

    static String get(Map<String, String> data, String... keys) {
        if (data == null || keys == null) {
            return "";
        }
        for (String key : keys) {
            if (key == null) {
                continue;
            }
            String value = data.get(key);
            if (value != null && !value.trim().isEmpty()) {
                return value.trim();
            }
        }
        return "";
    }

    static void logPayload(Map<String, String> data) {
        if (data == null || data.isEmpty()) {
            Log.w(TAG, "FCM data payload is empty");
            return;
        }
        StringBuilder sb = new StringBuilder("FCM data: ");
        for (Map.Entry<String, String> entry : data.entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue();
            if (value != null && value.length() > 80) {
                value = value.substring(0, 80) + "…";
            }
            sb.append(key).append("=").append(value).append(" ");
        }
        Log.i(TAG, sb.toString().trim());
    }

    /** Server fallback when sender/conversation ids are missing — not safe for grouping. */
    static boolean isPerMessageGroupKey(String key) {
        if (key == null || key.isEmpty()) {
            return false;
        }
        String k = key.trim().toLowerCase();
        return k.startsWith("msg_") || k.startsWith("msg-");
    }
}
