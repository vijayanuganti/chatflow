package com.chatflow.app;

import android.content.Context;
import android.content.SharedPreferences;

/** Credentials synced from the WebView for background notification actions. */
public final class ChatFlowAuthStore {

    private static final String PREFS = "chatflow_native_prefs";
    private static final String KEY_TOKEN = "access_token";
    private static final String KEY_API_BASE = "api_base_url";
    private static final String KEY_BROWSER_ID = "browser_id";

    private ChatFlowAuthStore() {}

    public static void save(Context context, String token, String apiBase, String browserId) {
        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString(KEY_TOKEN, token == null ? "" : token.trim());
        editor.putString(KEY_API_BASE, apiBase == null ? "" : apiBase.trim());
        editor.putString(KEY_BROWSER_ID, browserId == null ? "" : browserId.trim());
        editor.apply();
    }

    public static String getToken(Context context) {
        return prefs(context).getString(KEY_TOKEN, "").trim();
    }

    public static String getApiBase(Context context) {
        return prefs(context).getString(KEY_API_BASE, "").trim();
    }

    public static String getBrowserId(Context context) {
        return prefs(context).getString(KEY_BROWSER_ID, "").trim();
    }

    public static boolean hasCredentials(Context context) {
        return !getToken(context).isEmpty() && !getApiBase(context).isEmpty();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
