package com.chatflow.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Persists recent lines per {@code group_key} so consecutive FCM messages from one sender
 * update a single tray notification (OEMs may not expose the previous notification via
 * {@link android.app.NotificationManager#getActiveNotifications()} in time).
 */
public final class ChatFlowNotificationThreadStore {

    private static final String PREFS = "chatflow_notification_threads";
    private static final int MAX_LINES = 8;

    private ChatFlowNotificationThreadStore() {}

    public static final class Line {
        public final String text;
        public final long timeMs;

        Line(String text, long timeMs) {
            this.text = text;
            this.timeMs = timeMs;
        }
    }

    public static void appendLine(Context context, String groupKey, String text) {
        if (context == null || groupKey == null || groupKey.isEmpty()) {
            return;
        }
        String line = text == null ? "" : text.trim();
        if (line.isEmpty()) {
            return;
        }
        try {
            SharedPreferences prefs = prefs(context);
            JSONArray arr = new JSONArray(prefs.getString(groupKey, "[]"));
            JSONObject entry = new JSONObject();
            entry.put("t", line);
            entry.put("ms", System.currentTimeMillis());
            arr.put(entry);
            while (arr.length() > MAX_LINES) {
                arr.remove(0);
            }
            prefs.edit().putString(groupKey, arr.toString()).commit();
        } catch (Exception ignored) {
            /* ignore */
        }
    }

    public static Line[] getLines(Context context, String groupKey) {
        if (context == null || groupKey == null || groupKey.isEmpty()) {
            return new Line[0];
        }
        try {
            JSONArray arr = new JSONArray(prefs(context).getString(groupKey, "[]"));
            Line[] out = new Line[arr.length()];
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                out[i] = new Line(o.optString("t", ""), o.optLong("ms", System.currentTimeMillis()));
            }
            return out;
        } catch (Exception e) {
            return new Line[0];
        }
    }

    public static void clear(Context context, String groupKey) {
        if (context == null || groupKey == null || groupKey.isEmpty()) {
            return;
        }
        prefs(context).edit().remove(groupKey).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
