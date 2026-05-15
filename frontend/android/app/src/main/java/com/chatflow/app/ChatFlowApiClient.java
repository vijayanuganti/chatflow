package com.chatflow.app;

import android.content.Context;
import android.util.Log;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Background HTTP client for notification actions (reply / mark read). */
public final class ChatFlowApiClient {

    private static final String TAG = "ChatFlowApi";

    private ChatFlowApiClient() {}

    public static boolean postSendMessage(Context context, String messageId, String conversationId, String text) {
        try {
            JSONObject body = new JSONObject();
            body.put("message_id", messageId);
            body.put("text", text);
            if (conversationId != null && !conversationId.isEmpty()) {
                body.put("conversation_id", conversationId);
            }
            int code = postJson(context, "/send-message", body);
            return code >= 200 && code < 300;
        } catch (Exception e) {
            Log.e(TAG, "send-message payload error", e);
            return false;
        }
    }

    public static boolean postMarkRead(Context context, String messageId) {
        try {
            JSONObject body = new JSONObject();
            body.put("message_id", messageId);
            int code = postJson(context, "/mark-read", body);
            return code >= 200 && code < 300;
        } catch (Exception e) {
            Log.e(TAG, "mark-read payload error", e);
            return false;
        }
    }

    private static int postJson(Context context, String path, JSONObject body) {
        if (!ChatFlowAuthStore.hasCredentials(context)) {
            Log.w(TAG, "Missing auth — call ChatFlowNative.syncAuth from the app after login");
            return -1;
        }
        HttpURLConnection conn = null;
        try {
            String base = ChatFlowAuthStore.getApiBase(context);
            if (base.endsWith("/")) {
                base = base.substring(0, base.length() - 1);
            }
            String urlStr = base + path;
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + ChatFlowAuthStore.getToken(context));
            String browserId = ChatFlowAuthStore.getBrowserId(context);
            if (!browserId.isEmpty()) {
                conn.setRequestProperty("X-ChatFlow-Browser-Id", browserId);
            }
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                Log.w(TAG, "POST " + path + " failed HTTP " + code + " body=" + readStream(conn.getErrorStream()));
            } else {
                Log.i(TAG, "POST " + path + " OK");
            }
            return code;
        } catch (Exception e) {
            Log.e(TAG, "POST " + path + " error", e);
            return -1;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private static String readStream(InputStream stream) {
        if (stream == null) {
            return "";
        }
        try {
            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
            }
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }
}
