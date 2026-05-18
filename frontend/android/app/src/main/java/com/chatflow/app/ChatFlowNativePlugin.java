package com.chatflow.app;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ChatFlowNative")
public class ChatFlowNativePlugin extends Plugin {

    private static ChatFlowNativePlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        instance = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void setActiveChat(PluginCall call) {
        boolean inChat = Boolean.TRUE.equals(call.getBoolean("inChat", false));
        String conversationId = call.getString("conversationId", "");
        android.content.Context ctx = getContext().getApplicationContext();
        ChatFlowAppState.setActiveChat(ctx, inChat, conversationId == null ? "" : conversationId);
        ChatFlowAuthStore.setActiveConversationId(ctx, conversationId == null ? "" : conversationId);
        if (inChat) {
            ChatFlowAppState.setAppForeground(ctx, true);
            String groupKey = call.getString("groupKey", "");
            if (groupKey != null && !groupKey.isEmpty()) {
                ChatFlowNotificationHelper.cancelThread(ctx, groupKey);
            } else if (conversationId != null && !conversationId.isEmpty()) {
                ChatFlowNotificationHelper.cancelThread(ctx, "conv_" + conversationId.trim());
            }
        }
        JSObject result = new JSObject();
        result.put("inChat", inChat);
        result.put("conversationId", conversationId == null ? "" : conversationId);
        call.resolve(result);
    }

    @PluginMethod
    public void setAppForeground(PluginCall call) {
        boolean foreground = Boolean.TRUE.equals(call.getBoolean("foreground", false));
        ChatFlowAppState.setAppForeground(getContext().getApplicationContext(), foreground);
        call.resolve();
    }

    @PluginMethod
    public void setConversationSoundsEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        ChatFlowAuthStore.setConversationSoundsEnabled(
                getContext().getApplicationContext(), enabled);
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        call.resolve(result);
    }

    @PluginMethod
    public void getConversationSoundsEnabled(PluginCall call) {
        boolean enabled =
                ChatFlowAuthStore.isConversationSoundsEnabled(
                        getContext().getApplicationContext());
        JSObject result = new JSObject();
        result.put("enabled", enabled);
        call.resolve(result);
    }

    @PluginMethod
    public void showMessageNotification(PluginCall call) {
        String messageId = call.getString("messageId", "");
        String conversationId = call.getString("conversationId", "");
        String title = call.getString("title", "ChatFlow");
        String body = call.getString("body", "");
        if (messageId == null || messageId.isEmpty()) {
            call.reject("messageId required");
            return;
        }
        ChatFlowNotificationHelper.showMessage(
                getContext().getApplicationContext(),
                messageId,
                conversationId,
                title,
                body
        );
        call.resolve();
    }

    @PluginMethod
    public void syncAuth(PluginCall call) {
        String token = call.getString("auth_token", call.getString("token", ""));
        String apiBase = call.getString("apiBase", "");
        String browserId = call.getString("browserId", "");
        Context ctx = getContext().getApplicationContext();
        ChatFlowAuthStore.save(ctx, token, apiBase, browserId);
        JSObject result = new JSObject();
        result.put("prefs", ChatFlowAuthStore.PREFS_NAME);
        result.put("key", ChatFlowAuthStore.KEY_AUTH_TOKEN);
        result.put("tokenLength", ChatFlowAuthStore.getAuthTokenLength(ctx));
        call.resolve(result);
    }

    @PluginMethod
    public void clearAuth(PluginCall call) {
        ChatFlowAuthStore.clear(getContext().getApplicationContext());
        call.resolve();
    }

    public static void notifyMarkRead(String conversationId, String messageId) {
        ChatFlowNativePlugin plugin = instance;
        if (plugin == null) {
            return;
        }
        JSObject payload = new JSObject();
        if (conversationId != null) {
            payload.put("conversationId", conversationId);
        }
        if (messageId != null) {
            payload.put("messageId", messageId);
        }
        plugin.notifyListeners("markRead", payload);
    }
}
