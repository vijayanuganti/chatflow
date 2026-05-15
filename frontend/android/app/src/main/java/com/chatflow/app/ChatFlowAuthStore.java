package com.chatflow.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

/** JWT + API base for background notification actions (synced from the WebView on login). */
public final class ChatFlowAuthStore {

    private static final String TAG = "ChatFlowAuth";

    /** Must match React {@code nativeAuthSync} / Capacitor bridge. */
    public static final String PREFS_NAME = "chatflow_native_prefs";
    public static final String KEY_AUTH_TOKEN = "auth_token";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_API_BASE = "api_base_url";
    private static final String KEY_BROWSER_ID = "browser_id";

    private ChatFlowAuthStore() {}

    public static void save(Context context, String token, String apiBase, String browserId) {
        String t = token == null ? "" : token.trim();
        String base = apiBase == null ? "" : apiBase.trim();
        String bid = browserId == null ? "" : browserId.trim();

        SharedPreferences prefs = prefs(context);
        boolean ok = prefs.edit()
                .putString(KEY_AUTH_TOKEN, t)
                .putString(KEY_ACCESS_TOKEN, t)
                .putString(KEY_API_BASE, base)
                .putString(KEY_BROWSER_ID, bid)
                .commit();

        Log.i(
                TAG,
                "save prefs="
                        + PREFS_NAME
                        + " key="
                        + KEY_AUTH_TOKEN
                        + " len="
                        + t.length()
                        + " commit="
                        + ok
                        + " apiBase="
                        + (base.isEmpty() ? "(empty)" : base)
        );
    }

    public static void clear(Context context) {
        boolean ok = prefs(context).edit()
                .remove(KEY_AUTH_TOKEN)
                .remove(KEY_ACCESS_TOKEN)
                .remove(KEY_API_BASE)
                .remove(KEY_BROWSER_ID)
                .commit();
        Log.i(TAG, "clear prefs=" + PREFS_NAME + " commit=" + ok);
    }

    public static String getAuthToken(Context context) {
        SharedPreferences prefs = prefs(context);
        String token = prefs.getString(KEY_AUTH_TOKEN, null);
        if (token == null || token.trim().isEmpty()) {
            token = prefs.getString(KEY_ACCESS_TOKEN, null);
        }
        return token == null ? "" : token.trim();
    }

    public static int getAuthTokenLength(Context context) {
        return getAuthToken(context).length();
    }

    public static String getApiBase(Context context) {
        String base = prefs(context).getString(KEY_API_BASE, "").trim();
        if (base.isEmpty()) {
            base = context.getString(R.string.chatflow_api_base_default).trim();
        }
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base;
    }

    public static String getBrowserId(Context context) {
        return prefs(context).getString(KEY_BROWSER_ID, "").trim();
    }

    public static boolean hasAuthToken(Context context) {
        return getAuthTokenLength(context) > 0;
    }

    public static boolean hasCredentials(Context context) {
        return hasAuthToken(context) && !getApiBase(context).isEmpty();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
