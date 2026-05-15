package com.chatflow.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import androidx.core.app.RemoteInput;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Handles notification action buttons: inline direct reply and mark as read.
 */
public class NotificationActionReceiver extends BroadcastReceiver {

    private static final String TAG = "ChatFlowNotifyAction";
    private static final String SPEED_TAG = "ChatFlowSpeed";

    /** Must match {@link ChatFlowNotificationHelper#KEY_TEXT_REPLY} and RemoteInput result key. */
    public static final String KEY_TEXT_REPLY = ChatFlowNotificationHelper.KEY_TEXT_REPLY;

    public static final String ACTION_REPLY = "com.chatflow.app.REPLY_ACTION";
    public static final String ACTION_MARK_READ = "com.chatflow.app.MARK_READ_ACTION";

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        long actionStart = System.currentTimeMillis();
        Log.d(SPEED_TAG, "Start: " + actionStart + " action=onReceive");

        if (intent == null || intent.getAction() == null) {
            return;
        }

        final PendingResult pendingResult = goAsync();
        final Context appContext = context.getApplicationContext();
        final String action = intent.getAction();
        final String messageId = intent.getStringExtra(ChatFlowNotificationHelper.EXTRA_MESSAGE_ID);
        final String conversationId = intent.getStringExtra(ChatFlowNotificationHelper.EXTRA_CONVERSATION_ID);

        if (messageId == null || messageId.isEmpty()) {
            pendingResult.finish();
            return;
        }

        EXECUTOR.execute(() -> {
            try {
                if (ACTION_MARK_READ.equals(action)) {
                    handleMarkRead(appContext, messageId, conversationId, actionStart);
                } else if (ACTION_REPLY.equals(action)) {
                    handleReply(appContext, intent, messageId, conversationId, actionStart);
                }
            } finally {
                long done = System.currentTimeMillis();
                Log.d(SPEED_TAG, "End: " + done + " ms=" + (done - actionStart) + " action=onReceive_total");
                pendingResult.finish();
            }
        });
    }

    private void handleMarkRead(Context context, String messageId, String conversationId, long actionStart) {
        Log.d(SPEED_TAG, "Start: " + System.currentTimeMillis() + " action=mark_read_pre_network");

        // Dismiss immediately — don't wait for the server.
        ChatFlowNotificationHelper.cancel(context, messageId);

        boolean ok = ChatFlowApiClient.postMarkRead(context, messageId, conversationId);
        if (ok) {
            ChatFlowNativePlugin.notifyMarkRead(conversationId, messageId);
            Log.i(TAG, "Marked read messageId=" + messageId);
        } else {
            Log.w(TAG, "Mark read failed messageId=" + messageId);
        }
        Log.d(SPEED_TAG, "End: " + System.currentTimeMillis() + " ms=" + (System.currentTimeMillis() - actionStart) + " action=mark_read");
    }

    private void handleReply(
            Context context,
            Intent intent,
            String messageId,
            String conversationId,
            long actionStart
    ) {
        CharSequence replyText = null;
        Bundle remoteInput = RemoteInput.getResultsFromIntent(intent);
        if (remoteInput != null) {
            replyText = remoteInput.getCharSequence(KEY_TEXT_REPLY);
        }

        String text = replyText != null ? replyText.toString().trim() : "";
        if (text.isEmpty()) {
            Log.w(TAG, "Empty direct reply (key_text_reply)");
            return;
        }

        Log.d(TAG, "Reply: " + text.length() + " chars for msg=" + messageId);
        Log.d(SPEED_TAG, "Start: " + System.currentTimeMillis() + " action=reply_pre_network");

        // Dismiss immediately so the UI feels instant; network runs on pooled OkHttp.
        ChatFlowNotificationHelper.cancel(context, messageId);

        boolean ok = ChatFlowApiClient.postSendMessage(context, messageId, conversationId, text);
        if (ok) {
            Log.i(TAG, "Reply sent messageId=" + messageId);
        } else {
            Log.w(TAG, "Reply failed messageId=" + messageId);
        }
        Log.d(SPEED_TAG, "End: " + System.currentTimeMillis() + " ms=" + (System.currentTimeMillis() - actionStart) + " action=reply");
    }
}
