package com.chatflow.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

/** JWT + API base for background notification actions (synced from the WebView on login). */
public final class ChatFlowAuthStore {

    private static final String TAG = "ChatFlowAuth";

    private static final String PREFS = "chatflow_native_prefs";
    /** Primary token key (requested for notification actions). */
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
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString(KEY_AUTH_TOKEN, t);
        editor.putString(KEY_ACCESS_TOKEN, t);
        editor.putString(KEY_API_BASE, base);
        editor.putString(KEY_BROWSER_ID, bid);
        editor.apply();

        Log.d(TAG, "save auth_token len=" + t.length() + " apiBase=" + (base.isEmpty() ? "(empty)" : base));
    }

    /**
     * Resolves JWT from native prefs ({@link #KEY_AUTH_TOKEN} then legacy {@code access_token}).
     */
    public static String getAuthToken(Context context) {
        SharedPreferences prefs = prefs(context);
        String token = prefs.getString(KEY_AUTH_TOKEN, "").trim();
        if (token.isEmpty()) {
            token = prefs.getString(KEY_ACCESS_TOKEN, "").trim();
        }
        return token;
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
        return !getAuthToken(context).isEmpty();
    }

    public static boolean hasCredentials(Context context) {
        return hasAuthToken(context) && !getApiBase(context).isEmpty();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
