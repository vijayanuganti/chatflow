package com.chatflow.app;

import android.content.Context;
import android.util.Log;
import java.util.concurrent.TimeUnit;
import okhttp3.ConnectionPool;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.json.JSONObject;

/** Pooled HTTP client for fast notification actions (reply / mark read). */
public final class ChatFlowApiClient {

    private static final String TAG = "ChatFlowApi";
    private static final String SPEED_TAG = "ChatFlowSpeed";
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final String HEADER_PRIORITY = "X-Priority";

    /** Shared client — connection pool reused across every reply / mark-read. */
    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
            .connectionPool(new ConnectionPool(8, 5, TimeUnit.MINUTES))
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(12, TimeUnit.SECONDS)
            .writeTimeout(8, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build();

    private ChatFlowApiClient() {}

    public static boolean postSendMessage(Context context, String messageId, String conversationId, String text) {
        try {
            JSONObject body = new JSONObject();
            body.put("message_id", messageId);
            body.put("text", text);
            if (conversationId != null && !conversationId.isEmpty()) {
                body.put("conversation_id", conversationId);
            }
            return postJson(context, "/send-message", body);
        } catch (Exception e) {
            Log.e(TAG, "send-message payload error", e);
            return false;
        }
    }

    public static boolean postMarkRead(Context context, String messageId, String conversationId) {
        try {
            JSONObject body = new JSONObject();
            body.put("message_id", messageId);
            if (conversationId != null && !conversationId.isEmpty()) {
                body.put("conversation_id", conversationId);
            }
            return postJson(context, "/mark-read", body);
        } catch (Exception e) {
            Log.e(TAG, "mark-read payload error", e);
            return false;
        }
    }

    private static boolean postJson(Context context, String path, JSONObject body) {
        long t0 = System.currentTimeMillis();
        Log.d(SPEED_TAG, "Start: " + t0 + " path=" + path);

        if (!ChatFlowAuthStore.hasCredentials(context)) {
            Log.w(TAG, "Missing auth — call ChatFlowNative.syncAuth from the app after login");
            Log.d(SPEED_TAG, "End: " + System.currentTimeMillis() + " ms=" + (System.currentTimeMillis() - t0) + " auth=missing");
            return false;
        }

        try {
            String base = ChatFlowAuthStore.getApiBase(context);
            if (base.endsWith("/")) {
                base = base.substring(0, base.length() - 1);
            }
            String url = base + path;

            Request.Builder reqBuilder = new Request.Builder()
                    .url(url)
                    .post(RequestBody.create(body.toString(), JSON))
                    .header("Accept", "application/json")
                    .header("Authorization", "Bearer " + ChatFlowAuthStore.getToken(context))
                    .header(HEADER_PRIORITY, "High");

            String browserId = ChatFlowAuthStore.getBrowserId(context);
            if (!browserId.isEmpty()) {
                reqBuilder.header("X-ChatFlow-Browser-Id", browserId);
            }

            try (Response response = CLIENT.newCall(reqBuilder.build()).execute()) {
                int code = response.code();
                long t1 = System.currentTimeMillis();
                boolean ok = code >= 200 && code < 300;
                if (!ok) {
                    String errBody = response.body() != null ? response.body().string() : "";
                    Log.w(TAG, "POST " + path + " failed HTTP " + code + " body=" + errBody);
                } else {
                    Log.i(TAG, "POST " + path + " OK");
                }
                Log.d(SPEED_TAG, "End: " + t1 + " ms=" + (t1 - t0) + " path=" + path + " code=" + code);
                return ok;
            }
        } catch (Exception e) {
            long t1 = System.currentTimeMillis();
            Log.e(TAG, "POST " + path + " error", e);
            Log.d(SPEED_TAG, "End: " + t1 + " ms=" + (t1 - t0) + " path=" + path + " error=" + e.getMessage());
            return false;
        }
    }
}
