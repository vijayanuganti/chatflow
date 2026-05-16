package com.chatflow.app;

import android.content.Context;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.util.Log;

/** Short in-chat incoming tone when OS notifications are suppressed. */
public final class ChatFlowConversationSound {

    private static final String TAG = "ChatFlowConvSound";

    private ChatFlowConversationSound() {}

    public static void maybePlayIncoming(Context context) {
        if (context == null) {
            return;
        }
        if (!ChatFlowAuthStore.isConversationSoundsEnabled(context)) {
            Log.i(TAG, "conversation sounds disabled — skip");
            return;
        }
        try {
            ToneGenerator tone =
                    new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 55);
            tone.startTone(ToneGenerator.TONE_PROP_BEEP2, 95);
            tone.release();
            Log.i(TAG, "played inline conversation tone");
        } catch (Exception e) {
            Log.w(TAG, "inline tone failed: " + e.getMessage());
        }
    }
}
