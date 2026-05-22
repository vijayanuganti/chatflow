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
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;
import androidx.core.graphics.drawable.IconCompat;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Builds message notifications with Direct Reply and Mark as Read action buttons.
 * One tray slot per {@code group_key} (e.g. sender_uuid).
 */
public final class ChatFlowNotificationHelper {

    private static final String TAG = "ChatFlowNotify";

    public static final String CHANNEL_ID = "chatflow_messages_actions";
    public static final String CHANNEL_ID_FOREGROUND = "chatflow_messages_foreground";
    public static final String KEY_TEXT_REPLY = "key_text_reply";

    public static final String EXTRA_MESSAGE_ID = "message_id";
    public static final String EXTRA_CONVERSATION_ID = "conversation_id";
    public static final String EXTRA_NOTIFICATION_ID = "notification_id";
    public static final String EXTRA_GROUP_KEY = "group_key";

    /** Shade stack for all chat threads (each sender still has its own tag + id). */
    public static final String NOTIFICATION_GROUP = "chatflow_conversations";

    private static final ConcurrentHashMap<String, Object> GROUP_LOCKS = new ConcurrentHashMap<>();

    private ChatFlowNotificationHelper() {}

    public static String normalizeGroupKey(String key) {
        return key == null ? "" : key.trim();
    }

    private static Object lockFor(String groupKey) {
        return GROUP_LOCKS.computeIfAbsent(groupKey, k -> new Object());
    }

    /**
     * One tray slot per sender or conversation. Ignores per-message {@code msg_*} group keys
     * from the server when routing ids were missing.
     */
    public static String resolveThreadKey(
            Map<String, String> data,
            String messageId,
            String conversationId,
            String senderDisplayTitle
    ) {
        if (data != null) {
            String groupKey = ChatFlowFcmData.get(data, "group_key", "groupKey");
            if (!groupKey.isEmpty() && !ChatFlowFcmData.isPerMessageGroupKey(groupKey)) {
                return groupKey;
            }
            String tag = ChatFlowFcmData.get(data, "notification_tag", "notificationTag");
            if (!tag.isEmpty() && !ChatFlowFcmData.isPerMessageGroupKey(tag)) {
                return tag;
            }
            String senderId = ChatFlowFcmData.get(data, "sender_id", "senderId");
            if (!senderId.isEmpty()) {
                return "sender_" + senderId;
            }
        }

        String conv =
                ChatFlowFcmData.get(data, "conversation_id", "conversationId");
        if (conv.isEmpty()) {
            conv = normalizeGroupKey(conversationId);
        }
        if (!conv.isEmpty()) {
            return "conv_" + conv;
        }

        String title = normalizeGroupKey(senderDisplayTitle);
        if (!title.isEmpty() && !"ChatFlow".equalsIgnoreCase(title)) {
            return "sender_title_" + stableHash(title.toLowerCase());
        }

        if (messageId != null && !messageId.isEmpty()) {
            return "msg_" + messageId;
        }
        return "msg_" + UUID.randomUUID().toString();
    }

    public static String resolveThreadKey(Map<String, String> data, String messageId, String conversationId) {
        return resolveThreadKey(data, messageId, conversationId, null);
    }

    public static void showFromFcm(Context context, RemoteMessage remoteMessage) {
        if (context == null || remoteMessage == null) {
            return;
        }

        Map<String, String> data = remoteMessage.getData();
        ChatFlowFcmData.logPayload(data);

        String messageId = ChatFlowFcmData.get(data, "message_id", "messageId", "id");
        String conversationId = ChatFlowFcmData.get(data, "conversation_id", "conversationId");
        String title = ChatFlowFcmData.get(data, "title");
        String body = ChatFlowFcmData.get(data, "body");

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

        String avatarUrl = ChatFlowFcmData.get(data, "sender_avatar_url", "senderAvatarUrl");
        String threadKey = resolveThreadKey(data, messageId, conversationId, title);
        if (ChatFlowFcmData.get(data, "sender_id", "senderId").isEmpty()
                && ChatFlowFcmData.get(data, "conversation_id", "conversationId").isEmpty()) {
            Log.w(
                    TAG,
                    "FCM missing sender_id and conversation_id — grouping by sender title threadKey="
                            + threadKey);
        }
        showMessage(context, messageId, conversationId, title, body, avatarUrl, false, threadKey);
    }

    public static void showMessageSoft(
            Context context,
            String messageId,
            String conversationId,
            String title,
            String body,
            String avatarUrl
    ) {
        String threadKey = resolveThreadKey(null, messageId, conversationId);
        showMessage(context, messageId, conversationId, title, body, avatarUrl, true, threadKey);
    }

    public static void showMessage(
            Context context,
            String messageId,
            String conversationId,
            String title,
            String body
    ) {
        String threadKey = resolveThreadKey(null, messageId, conversationId);
        showMessage(context, messageId, conversationId, title, body, null, false, threadKey);
    }

    private static void showMessage(
            Context context,
            String messageId,
            String conversationId,
            String title,
            String body,
            String avatarUrl,
            boolean soft,
            String threadKey
    ) {
        if (context == null || messageId == null || messageId.isEmpty()) {
            return;
        }

        if (ChatFlowAppState.shouldSuppressForActiveChat(context, conversationId)) {
            Log.i(TAG, "showMessage blocked — user in active chat conv=" + conversationId);
            return;
        }

        Context appCtx = context.getApplicationContext();
        if (soft) {
            ensureForegroundChannel(appCtx);
        } else {
            ensureActionsChannel(appCtx);
        }
        String channelId = soft ? CHANNEL_ID_FOREGROUND : CHANNEL_ID;

        String groupKey = normalizeGroupKey(
                threadKey != null && !threadKey.isEmpty()
                        ? threadKey
                        : resolveThreadKey(null, messageId, conversationId));
        if (groupKey.isEmpty()) {
            groupKey = "msg_" + messageId;
        }

        synchronized (lockFor(groupKey)) {
            ChatFlowNotificationThreadStore.appendLine(appCtx, groupKey, body);
        }

        cancelLegacyMessageNotification(appCtx, messageId);

        final String fkGroupKey = groupKey;
        final String fkMessageId = messageId;
        final String fkConversationId = conversationId;
        final String fkTitle = title;
        final String fkBody = body;
        final String fkAvatarUrl = avatarUrl;
        final boolean fkSoft = soft;
        final String fkChannelId = channelId;

        ChatFlowNotificationCoalescer.schedule(
                groupKey,
                () ->
                        postTrayNotification(
                                appCtx,
                                fkGroupKey,
                                fkMessageId,
                                fkConversationId,
                                fkTitle,
                                fkBody,
                                fkAvatarUrl,
                                fkSoft,
                                fkChannelId));

        return;
    }

    private static void cancelLegacyMessageNotification(Context appCtx, String messageId) {
        if (messageId == null || messageId.isEmpty()) {
            return;
        }
        int legacyId = notificationIdFor(messageId);
        NotificationManagerCompat nm = NotificationManagerCompat.from(appCtx);
        nm.cancel(legacyId);
        nm.cancel(null, legacyId);
    }

    private static void postTrayNotification(
            Context appCtx,
            String groupKey,
            String messageId,
            String conversationId,
            String title,
            String body,
            String avatarUrl,
            boolean soft,
            String channelId
    ) {
        final int notificationId = notificationIdForThread(groupKey);

        RemoteInput remoteInput = new RemoteInput.Builder(KEY_TEXT_REPLY)
                .setLabel("Reply")
                .build();

        Intent replyIntent = new Intent(appCtx, NotificationActionReceiver.class);
        replyIntent.setAction(NotificationActionReceiver.ACTION_REPLY);
        replyIntent.putExtra(EXTRA_MESSAGE_ID, messageId);
        replyIntent.putExtra(EXTRA_CONVERSATION_ID, conversationId);
        replyIntent.putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        replyIntent.putExtra(EXTRA_GROUP_KEY, groupKey);

        PendingIntent replyPendingIntent = PendingIntent.getBroadcast(
                appCtx,
                requestCode(groupKey, 1),
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

        Intent markReadIntent = new Intent(appCtx, NotificationActionReceiver.class);
        markReadIntent.setAction(NotificationActionReceiver.ACTION_MARK_READ);
        markReadIntent.putExtra(EXTRA_MESSAGE_ID, messageId);
        markReadIntent.putExtra(EXTRA_CONVERSATION_ID, conversationId);
        markReadIntent.putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        markReadIntent.putExtra(EXTRA_GROUP_KEY, groupKey);

        PendingIntent markReadPendingIntent = PendingIntent.getBroadcast(
                appCtx,
                requestCode(groupKey, 2),
                markReadIntent,
                markReadPendingFlags()
        );

        Intent openIntent = new Intent(appCtx, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        openIntent.putExtra(EXTRA_CONVERSATION_ID, conversationId);
        openIntent.putExtra(EXTRA_GROUP_KEY, groupKey);

        PendingIntent contentPendingIntent = PendingIntent.getActivity(
                appCtx,
                requestCode(groupKey, 3),
                openIntent,
                markReadPendingFlags()
        );

        String senderName = title != null && !title.isEmpty() ? title : "ChatFlow";

        Bitmap avatarBitmap = ChatFlowAvatarLoader.loadForNotification(appCtx, avatarUrl);
        Person.Builder senderBuilder = new Person.Builder().setName(senderName);
        if (avatarBitmap != null) {
            senderBuilder.setIcon(IconCompat.createWithBitmap(avatarBitmap));
        }
        Person sender = senderBuilder.build();

        NotificationCompat.MessagingStyle messagingStyle = buildThreadMessagingStyle(
                appCtx, groupKey, senderName, sender);

        String latestBody = body != null ? body : "";
        int lineCount = ChatFlowNotificationThreadStore.getLines(appCtx, groupKey).length;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(appCtx, channelId)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(senderName)
                .setContentText(latestBody)
                .setStyle(messagingStyle)
                .setPriority(soft ? NotificationCompat.PRIORITY_LOW : NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setGroup(NOTIFICATION_GROUP)
                .setSortKey(groupKey)
                .setNumber(Math.max(1, lineCount))
                .setContentIntent(contentPendingIntent)
                .addAction(replyAction)
                .addAction(android.R.drawable.ic_menu_view, "Mark as Read", markReadPendingIntent);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setShortcutId(groupKey);
        }

        if (avatarBitmap != null) {
            builder.setLargeIcon(avatarBitmap);
        }

        if (soft) {
            builder.setSilent(true).setDefaults(0).setVibrate(null);
        }

        Notification built = builder.build();
        NotificationManagerCompat nmCompat = NotificationManagerCompat.from(appCtx);
        nmCompat.notify(groupKey, notificationId, built);

        Log.i(
                TAG,
                "Posted notify tag="
                        + groupKey
                        + " id="
                        + notificationId
                        + " lines="
                        + lineCount
                        + " latest="
                        + latestBody);
    }

    private static NotificationCompat.MessagingStyle buildThreadMessagingStyle(
            Context context,
            String groupKey,
            String senderName,
            Person sender
    ) {
        Person self = new Person.Builder().setName("You").build();
        NotificationCompat.MessagingStyle style =
                new NotificationCompat.MessagingStyle(self).setConversationTitle(senderName);
        ChatFlowNotificationThreadStore.Line[] lines;
        synchronized (lockFor(groupKey)) {
            lines = ChatFlowNotificationThreadStore.getLines(context, groupKey);
        }
        for (ChatFlowNotificationThreadStore.Line line : lines) {
            if (line.text != null && !line.text.isEmpty()) {
                style.addMessage(line.text, line.timeMs, sender);
            }
        }
        return style;
    }

    public static void cancel(Context context, String messageId) {
        if (context == null || messageId == null || messageId.isEmpty()) {
            return;
        }
        NotificationManagerCompat.from(context.getApplicationContext())
                .cancel(null, notificationIdFor(messageId));
    }

    public static void cancelThread(Context context, String groupKey) {
        if (context == null || groupKey == null || groupKey.isEmpty()) {
            return;
        }
        String key = normalizeGroupKey(groupKey);
        ChatFlowNotificationCoalescer.cancel(key);
        int id = notificationIdForThread(key);
        NotificationManagerCompat nm = NotificationManagerCompat.from(context.getApplicationContext());
        nm.cancel(key, id);
        ChatFlowNotificationThreadStore.clear(context.getApplicationContext(), key);
    }

    /** Remove every tray notification (logout / session end). */
    public static void cancelAll(Context context) {
        if (context == null) {
            return;
        }
        Context appCtx = context.getApplicationContext();
        ChatFlowNotificationCoalescer.cancelAll();
        NotificationManagerCompat.from(appCtx).cancelAll();
        ChatFlowNotificationThreadStore.clearAll(appCtx);
    }

    public static int notificationIdFor(String messageId) {
        return stableHash("msg-" + messageId);
    }

    public static int notificationIdForThread(String threadKey) {
        return stableHash("thread-" + threadKey);
    }

    private static int stableHash(String key) {
        int hash = key.hashCode();
        if (hash == Integer.MIN_VALUE) {
            hash = 0;
        }
        return (Math.abs(hash) % 500_000) + 1;
    }

    private static int requestCode(String groupKey, int slot) {
        return (stableHash("req-" + groupKey) + slot) & 0xffff;
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
