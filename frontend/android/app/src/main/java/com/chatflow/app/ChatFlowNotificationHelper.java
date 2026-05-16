package com.chatflow.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;
import androidx.core.graphics.drawable.IconCompat;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import java.util.UUID;

/**
 * Builds message notifications with Direct Reply and Mark as Read action buttons.
 */
public final class ChatFlowNotificationHelper {

    private static final String TAG = "ChatFlowNotify";

    /** Dedicated channel — never shared with Capacitor's generic channel setup. */
    public static final String CHANNEL_ID = "chatflow_messages_actions";

    /** Low-profile channel when the app is open but not in the active chat. */
    public static final String CHANNEL_ID_FOREGROUND = "chatflow_messages_foreground";

    /** RemoteInput result key — must match {@link NotificationActionReceiver#KEY_TEXT_REPLY}. */
    public static final String KEY_TEXT_REPLY = "key_text_reply";

    public static final String EXTRA_MESSAGE_ID = "message_id";
    public static final String EXTRA_CONVERSATION_ID = "conversation_id";
    public static final String EXTRA_NOTIFICATION_ID = "notification_id";

    private ChatFlowNotificationHelper() {}

    public static void showFromFcm(Context context, RemoteMessage remoteMessage) {
        if (context == null || remoteMessage == null) {
            return;
        }

        Map<String, String> data = remoteMessage.getData();
        String messageId = data != null ? data.get("message_id") : null;
        String conversationId = data != null ? data.get("conversation_id") : null;
        String title = data != null ? data.get("title") : null;
        String body = data != null ? data.get("body") : null;

        RemoteMessage.Notification notification = remoteMessage.getNotification();
        if (title == null || title.isEmpty()) {
            title = notification != null && notification.getTitle() != null
                    ? notification.getTitle()
                    : "ChatFlow";
        }
        if (body == null) {
            body = notification != null && notification.getBody() != null
                    ? notification.getBody()
                    : "";
        }
        if (messageId == null || messageId.isEmpty()) {
            messageId = remoteMessage.getMessageId();
        }
        if (messageId == null || messageId.isEmpty()) {
            messageId = UUID.randomUUID().toString();
        }

        String avatarUrl = data != null ? data.get("sender_avatar_url") : null;
        showMessage(context, messageId, conversationId, title, body, avatarUrl, false);
    }

    /** Foreground / other-screen: minimal heads-up, no sound or vibration. */
    public static void showMessageSoft(
            Context context,
            String messageId,
            String conversationId,
            String title,
            String body,
            String avatarUrl
    ) {
        showMessage(context, messageId, conversationId, title, body, avatarUrl, true);
    }

    /**
     * Post a message notification with Reply + Mark as Read (used by FCM service and native plugin).
     */
    public static void showMessage(
            Context context,
            String messageId,
            String conversationId,
            String title,
            String body
    ) {
        showMessage(context, messageId, conversationId, title, body, null, false);
    }

    private static void showMessage(
            Context context,
            String messageId,
            String conversationId,
            String title,
            String body,
            String avatarUrl,
            boolean soft
    ) {
        if (context == null || messageId == null || messageId.isEmpty()) {
            return;
        }

        if (ChatFlowAppState.shouldSuppressForActiveChat(context, conversationId)) {
            Log.i(TAG, "showMessage blocked — user in active chat conv=" + conversationId);
            return;
        }

        if (soft) {
            ensureForegroundChannel(context);
        } else {
            ensureActionsChannel(context);
        }
        String channelId = soft ? CHANNEL_ID_FOREGROUND : CHANNEL_ID;

        int notificationId = notificationIdFor(messageId);
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            Log.e(TAG, "NotificationManager unavailable");
            return;
        }

        RemoteInput remoteInput = new RemoteInput.Builder(KEY_TEXT_REPLY)
                .setLabel("Reply")
                .build();

        Intent replyIntent = new Intent(context, NotificationActionReceiver.class);
        replyIntent.setAction(NotificationActionReceiver.ACTION_REPLY);
        replyIntent.putExtra(EXTRA_MESSAGE_ID, messageId);
        replyIntent.putExtra(EXTRA_CONVERSATION_ID, conversationId);
        replyIntent.putExtra(EXTRA_NOTIFICATION_ID, notificationId);

        PendingIntent replyPendingIntent = PendingIntent.getBroadcast(
                context,
                notificationId * 10 + 1,
                replyIntent,
                replyPendingFlags()
        );

        NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                android.R.drawable.ic_menu_send,
                "Reply",
                replyPendingIntent
        )
                .addRemoteInput(remoteInput)
                .setAllowGeneratedReplies(true)
                .build();

        Intent markReadIntent = new Intent(context, NotificationActionReceiver.class);
        markReadIntent.setAction(NotificationActionReceiver.ACTION_MARK_READ);
        markReadIntent.putExtra(EXTRA_MESSAGE_ID, messageId);
        markReadIntent.putExtra(EXTRA_CONVERSATION_ID, conversationId);
        markReadIntent.putExtra(EXTRA_NOTIFICATION_ID, notificationId);

        PendingIntent markReadPendingIntent = PendingIntent.getBroadcast(
                context,
                notificationId * 10 + 2,
                markReadIntent,
                markReadPendingFlags()
        );

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        openIntent.putExtra(EXTRA_CONVERSATION_ID, conversationId);

        PendingIntent contentPendingIntent = PendingIntent.getActivity(
                context,
                notificationId * 10 + 3,
                openIntent,
                markReadPendingFlags()
        );

        String senderName = title != null && !title.isEmpty() ? title : "ChatFlow";
        String messageBody = body != null ? body : "";

        Bitmap avatarBitmap = ChatFlowAvatarLoader.loadForNotification(context, avatarUrl);
        Person.Builder senderBuilder = new Person.Builder().setName(senderName);
        if (avatarBitmap != null) {
            senderBuilder.setIcon(IconCompat.createWithBitmap(avatarBitmap));
        }
        Person sender = senderBuilder.build();

        NotificationCompat.MessagingStyle messagingStyle = new NotificationCompat.MessagingStyle(
                new Person.Builder().setName("You").build()
        )
                .setConversationTitle(senderName)
                .addMessage(messageBody, System.currentTimeMillis(), sender);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(senderName)
                .setContentText(messageBody)
                .setStyle(messagingStyle)
                .setPriority(
                        soft ? NotificationCompat.PRIORITY_LOW : NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(contentPendingIntent)
                .addAction(replyAction)
                .addAction(android.R.drawable.ic_menu_view, "Mark as Read", markReadPendingIntent);

        if (avatarBitmap != null) {
            builder.setLargeIcon(avatarBitmap);
        }

        if (soft) {
            builder.setSilent(true).setDefaults(0).setVibrate(null);
        }

        nm.notify(notificationId, builder.build());
        Log.i(
                TAG,
                "Posted notification id="
                        + notificationId
                        + " channel="
                        + channelId
                        + " soft="
                        + soft
                        + " with Reply+MarkAsRead");
    }

    public static void cancel(Context context, String messageId) {
        if (context == null || messageId == null || messageId.isEmpty()) {
            return;
        }
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(notificationIdFor(messageId));
        }
    }

    public static int notificationIdFor(String messageId) {
        return Math.abs(("msg-" + messageId).hashCode());
    }

    private static int replyPendingFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        return flags;
    }

    private static int markReadPendingFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return flags;
    }

    /** Call from {@link MainActivity} at startup so the channel exists before the first push. */
    public static void ensureActionsChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) {
            return;
        }

        NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
        if (existing != null && existing.getImportance() < NotificationManager.IMPORTANCE_HIGH) {
            nm.deleteNotificationChannel(CHANNEL_ID);
            existing = null;
        }
        if (existing != null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Chat messages",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("New messages with reply and mark-as-read actions");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setBypassDnd(true);
        channel.setShowBadge(true);
        nm.createNotificationChannel(channel);
        Log.i(TAG, "Created channel " + CHANNEL_ID);
    }

    public static void ensureForegroundChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) {
            return;
        }
        NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID_FOREGROUND);
        if (existing != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID_FOREGROUND,
                "In-app message hints",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Quiet alerts while ChatFlow is open");
        channel.enableVibration(false);
        channel.setSound(null, null);
        channel.setShowBadge(true);
        nm.createNotificationChannel(channel);
        Log.i(TAG, "Created channel " + CHANNEL_ID_FOREGROUND);
    }
}
