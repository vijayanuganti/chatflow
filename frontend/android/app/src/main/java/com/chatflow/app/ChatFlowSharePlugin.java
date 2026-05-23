package com.chatflow.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;

@CapacitorPlugin(name = "ChatFlowShare")
public class ChatFlowSharePlugin extends Plugin {

    private static ChatFlowSharePlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
        if (ChatFlowShareStore.snapshot().length() > 0) {
            notifyShareReceived();
        }
    }

    @Override
    protected void handleOnDestroy() {
        instance = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getPendingShares(PluginCall call) {
        JSONArray arr = ChatFlowShareStore.snapshot();
        JSObject ret = new JSObject();
        ret.put("items", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearPendingShares(PluginCall call) {
        ChatFlowShareStore.clear();
        call.resolve();
    }

    public static void ingestIntent(android.content.Context context, android.content.Intent intent) {
        if (context == null || intent == null) {
            return;
        }
        boolean added =
                ChatFlowShareIntentHandler.ingest(context.getApplicationContext(), intent);
        if (added && instance != null) {
            instance.notifyShareReceived();
        }
    }

    private void notifyShareReceived() {
        notifyListeners("shareReceived", new JSObject());
    }
}
