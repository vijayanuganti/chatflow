package com.chatflow.app;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/** Pending items from Android share intents until the WebView consumes them. */
public final class ChatFlowShareStore {

    private static final List<JSONObject> PENDING = new ArrayList<>();
    private static final Object LOCK = new Object();

    private ChatFlowShareStore() {}

    public static void add(JSONObject item) {
        if (item == null) {
            return;
        }
        synchronized (LOCK) {
            PENDING.add(item);
        }
    }

    public static void clear() {
        synchronized (LOCK) {
            PENDING.clear();
        }
    }

    public static JSONArray snapshot() {
        synchronized (LOCK) {
            JSONArray arr = new JSONArray();
            for (JSONObject o : PENDING) {
                arr.put(o);
            }
            return arr;
        }
    }

    public static String newId() {
        return UUID.randomUUID().toString();
    }
}
