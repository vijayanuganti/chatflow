package com.chatflow.app;

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
        String token = call.getString("token", "");
        String apiBase = call.getString("apiBase", "");
        String browserId = call.getString("browserId", "");
        ChatFlowAuthStore.save(getContext(), token, apiBase, browserId);
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
