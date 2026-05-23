package com.chatflow.app;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Foreground + active-chat flags synced from the WebView so FCM can choose notification style.
 */
public final class ChatFlowAppState {

    public static final String PREFS_NAME = "chatflow_app_state";
    public static final String KEY_APP_FOREGROUND = "app_foreground";
    public static final String KEY_IN_CHAT = "is_in_chat";
    public static final String KEY_ACTIVE_CONVERSATION_ID = "active_conversation_id";

    public enum NotifyMode {
        /** App in background — full banner + system sound. */
        FULL,
        /** App open on another screen — quiet heads-up, no channel sound. */
        SOFT,
        /** User is viewing this conversation — no OS banner. */
        SUPPRESS
    }

    private ChatFlowAppState() {}

    public static void setAppForeground(Context context, boolean foreground) {
        prefs(context).edit().putBoolean(KEY_APP_FOREGROUND, foreground).apply();
    }

    public static boolean isAppForeground(Context context) {
        return prefs(context).getBoolean(KEY_APP_FOREGROUND, false);
    }

    public static void setActiveChat(Context context, boolean inChat, String conversationId) {
        SharedPreferences.Editor editor = prefs(context).edit();
        editor.putBoolean(KEY_IN_CHAT, inChat);
        editor.commit();
        ChatFlowAuthStore.setActiveConversationId(context, conversationId);
    }

    public static boolean isInChat(Context context) {
        return prefs(context).getBoolean(KEY_IN_CHAT, false);
    }

    public static String getActiveConversationId(Context context) {
        return ChatFlowAuthStore.getActiveConversationId(context);
    }

  /**
     * True when the app is foreground and the user is inside the matching chat thread.
     * Uses {@link #KEY_ACTIVE_CONVERSATION_ID} only (not {@link #KEY_IN_CHAT}) so a stale
     * in-chat flag cannot allow banners through.
     */
    public static boolean shouldSuppressForActiveChat(
            Context context, String incomingConversationId) {
        if (!isAppForeground(context)) {
            return false;
        }
        if (incomingConversationId == null || incomingConversationId.isEmpty()) {
            return false;
        }
        String active = getActiveConversationId(context);
        return !active.isEmpty() && active.equals(incomingConversationId.trim());
    }

    public static boolean isViewingConversation(Context context, String incomingConversationId) {
        return shouldSuppressForActiveChat(context, incomingConversationId);
    }

    public static NotifyMode resolveNotifyMode(Context context, String incomingConversationId) {
        if (!isAppForeground(context)) {
            return NotifyMode.FULL;
        }
        if (shouldSuppressForActiveChat(context, incomingConversationId)) {
            return NotifyMode.SUPPRESS;
        }
        return NotifyMode.SOFT;
    }

    /** After logout so background FCM is not treated as foreground. */
    public static void resetForLogout(Context context) {
        if (context == null) {
            return;
        }
        prefs(context)
                .edit()
                .putBoolean(KEY_APP_FOREGROUND, false)
                .putBoolean(KEY_IN_CHAT, false)
                .apply();
        ChatFlowAuthStore.setActiveConversationId(context, "");
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
