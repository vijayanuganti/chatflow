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

    /** Matches FastAPI {@code POST /api/notifications/direct-reply}. */
    private static final String PATH_DIRECT_REPLY = "/notifications/direct-reply";
    /** Matches FastAPI {@code POST /api/notifications/mark-read}. */
    private static final String PATH_MARK_READ = "/notifications/mark-read";
    /** Matches FastAPI {@code POST /api/notifications/update-status}. */
    private static final String PATH_UPDATE_STATUS = "/notifications/update-status";

    private static final java.util.concurrent.ExecutorService BG =
            java.util.concurrent.Executors.newCachedThreadPool();

    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
            .connectionPool(new ConnectionPool(8, 5, TimeUnit.MINUTES))
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(12, TimeUnit.SECONDS)
            .writeTimeout(8, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build();

    /** Short timeouts for delivery receipts while the FCM process may be suspended (OPPO etc.). */
    private static final OkHttpClient URGENT_CLIENT = new OkHttpClient.Builder()
            .connectTimeout(2, TimeUnit.SECONDS)
            .readTimeout(2, TimeUnit.SECONDS)
            .writeTimeout(2, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false)
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
            return postJson(context, PATH_DIRECT_REPLY, body);
        } catch (Exception e) {
            Log.e(TAG, "direct-reply payload error", e);
            return false;
        }
    }

    /** Fire-and-forget status update (delivered / seen) for WhatsApp-style ticks. */
    public static void postUpdateStatusAsync(Context context, String messageId, String status) {
        if (messageId == null || messageId.isEmpty() || status == null || status.isEmpty()) {
            return;
        }
        final Context appCtx = context.getApplicationContext();
        BG.execute(() -> postUpdateStatus(appCtx, messageId, status));
    }

    public static boolean postUpdateStatus(Context context, String messageId, String status) {
        try {
            JSONObject body = new JSONObject();
            body.put("message_id", messageId);
            body.put("status", status);
            return postJson(context, PATH_UPDATE_STATUS, body);
        } catch (Exception e) {
            Log.e(TAG, "update-status payload error", e);
            return false;
        }
    }

    /**
     * Synchronous delivery/seen receipt with 2s timeouts — call only from a high-priority worker thread.
     */
    public static boolean postUpdateStatusUrgent(Context context, String messageId, String status) {
        Log.i(TAG, "update-status urgent message_id=" + (messageId != null ? messageId : "NULL") + " status=" + status);
        if (messageId == null || messageId.isEmpty()) {
            Log.w(TAG, "update-status urgent skipped: message_id is null or empty");
            return false;
        }
        if (status == null || status.isEmpty()) {
            Log.w(TAG, "update-status urgent skipped: status is null or empty");
            return false;
        }
        try {
            JSONObject body = new JSONObject();
            body.put("message_id", messageId);
            body.put("status", status);
            return postJson(context, PATH_UPDATE_STATUS, body, URGENT_CLIENT);
        } catch (Exception e) {
            Log.e(TAG, "update-status urgent payload error message_id=" + messageId, e);
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
            return postJson(context, PATH_MARK_READ, body);
        } catch (Exception e) {
            Log.e(TAG, "mark-read payload error", e);
            return false;
        }
    }

    private static boolean postJson(Context context, String path, JSONObject body) {
        return postJson(context, path, body, CLIENT);
    }

    private static boolean postJson(Context context, String path, JSONObject body, OkHttpClient client) {
        long t0 = System.currentTimeMillis();
        Log.d(SPEED_TAG, "Start: " + t0 + " path=" + path);

        String savedToken = ChatFlowAuthStore.getAuthToken(context);
        if (savedToken.isEmpty()) {
            Log.w(TAG, "auth_token missing in SharedPreferences — open app and log in once");
            Log.d(
                    SPEED_TAG,
                    "End: "
                            + System.currentTimeMillis()
                            + " ms="
                            + (System.currentTimeMillis() - t0)
                            + " path="
                            + path
                            + " code=401 auth=missing"
            );
            return false;
        }

        String base = ChatFlowAuthStore.getApiBase(context);
        if (base.isEmpty()) {
            Log.w(TAG, "api_base_url missing");
            Log.d(
                    SPEED_TAG,
                    "End: "
                            + System.currentTimeMillis()
                            + " ms="
                            + (System.currentTimeMillis() - t0)
                            + " path="
                            + path
                            + " code=0 auth=no_api_base"
            );
            return false;
        }

        try {
            String url = base + path;

            Request.Builder reqBuilder = new Request.Builder()
                    .url(url)
                    .post(RequestBody.create(body.toString(), JSON))
                    .addHeader("Accept", "application/json")
                    .addHeader("Authorization", "Bearer " + savedToken)
                    .addHeader(HEADER_PRIORITY, "High");

            String browserId = ChatFlowAuthStore.getBrowserId(context);
            if (!browserId.isEmpty()) {
                reqBuilder.addHeader("X-ChatFlow-Browser-Id", browserId);
            }

            try (Response response = client.newCall(reqBuilder.build()).execute()) {
                int code = response.code();
                long t1 = System.currentTimeMillis();
                boolean ok = code >= 200 && code < 300;
                if (!ok) {
                    String errBody = response.body() != null ? response.body().string() : "";
                    Log.w(TAG, "POST " + path + " HTTP " + code + " body=" + errBody);
                } else {
                    Log.i(TAG, "POST " + path + " HTTP " + code);
                }
                Log.d(
                        SPEED_TAG,
                        "End: "
                                + t1
                                + " ms="
                                + (t1 - t0)
                                + " path="
                                + path
                                + " code="
                                + code
                                + " auth=ok"
                );
                return ok;
            }
        } catch (Exception e) {
            long t1 = System.currentTimeMillis();
            Log.e(TAG, "POST " + path + " error", e);
            Log.d(
                    SPEED_TAG,
                    "End: "
                            + t1
                            + " ms="
                            + (t1 - t0)
                            + " path="
                            + path
                            + " code=0 auth=ok error="
                            + e.getMessage()
            );
            return false;
        }
    }
}
