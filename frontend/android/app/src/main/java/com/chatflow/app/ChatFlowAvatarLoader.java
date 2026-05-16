package com.chatflow.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.util.Log;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** Downloads notification avatars with a tight timeout and circular crop. */
public final class ChatFlowAvatarLoader {

    private static final String TAG = "ChatFlowAvatar";
    private static final int AVATAR_SIZE_PX = 256;
    private static final int DOWNLOAD_TIMEOUT_MS = 500;
    private static final ExecutorService EXECUTOR = Executors.newCachedThreadPool();

    private ChatFlowAvatarLoader() {}

    public static Bitmap loadForNotification(Context context, String avatarUrl) {
        if (context == null) {
            return null;
        }
        String resolved = resolveAvatarUrl(context, avatarUrl);
        if (resolved == null || resolved.isEmpty()) {
            return placeholder(context);
        }
        Future<Bitmap> future =
                EXECUTOR.submit(
                        new Callable<Bitmap>() {
                            @Override
                            public Bitmap call() {
                                return downloadBitmap(resolved);
                            }
                        });
        try {
            Bitmap raw = future.get(DOWNLOAD_TIMEOUT_MS, TimeUnit.MILLISECONDS);
            if (raw == null) {
                return placeholder(context);
            }
            return circleCrop(scaleDown(raw, AVATAR_SIZE_PX));
        } catch (TimeoutException e) {
            future.cancel(true);
            Log.w(TAG, "avatar download timed out url=" + resolved);
        } catch (Exception e) {
            Log.w(TAG, "avatar download failed: " + e.getMessage());
        }
        return placeholder(context);
    }

    private static String resolveAvatarUrl(Context context, String url) {
        if (url == null) {
            return null;
        }
        String trimmed = url.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return trimmed;
        }
        String base = ChatFlowAuthStore.getApiBase(context);
        if (base.isEmpty()) {
            return null;
        }
        if (trimmed.startsWith("/")) {
            return base + trimmed;
        }
        return base + "/" + trimmed;
    }

    private static Bitmap downloadBitmap(String urlString) {
        HttpURLConnection connection = null;
        InputStream in = null;
        try {
            URL url = new URL(urlString);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(DOWNLOAD_TIMEOUT_MS);
            connection.setReadTimeout(DOWNLOAD_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "ChatFlow-Android");
            int code = connection.getResponseCode();
            if (code < 200 || code >= 300) {
                Log.w(TAG, "avatar HTTP " + code);
                return null;
            }
            in = connection.getInputStream();
            return BitmapFactory.decodeStream(in);
        } catch (Exception e) {
            Log.w(TAG, "download error: " + e.getMessage());
            return null;
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (Exception ignored) {
                }
            }
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static Bitmap scaleDown(Bitmap source, int maxSize) {
        int w = source.getWidth();
        int h = source.getHeight();
        if (w <= 0 || h <= 0) {
            return source;
        }
        float scale = Math.min((float) maxSize / w, (float) maxSize / h);
        if (scale >= 1f) {
            return source;
        }
        int nw = Math.max(1, Math.round(w * scale));
        int nh = Math.max(1, Math.round(h * scale));
        return Bitmap.createScaledBitmap(source, nw, nh, true);
    }

    private static Bitmap circleCrop(Bitmap bitmap) {
        int size = Math.min(bitmap.getWidth(), bitmap.getHeight());
        Bitmap output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        Rect rect = new Rect(0, 0, size, size);
        int x = (bitmap.getWidth() - size) / 2;
        int y = (bitmap.getHeight() - size) / 2;
        canvas.drawARGB(0, 0, 0, 0);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint);
        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        canvas.drawBitmap(bitmap, new Rect(x, y, x + size, y + size), rect, paint);
        return output;
    }

    private static Bitmap placeholder(Context context) {
        try {
            return circleCrop(
                    BitmapFactory.decodeResource(context.getResources(), R.mipmap.ic_launcher));
        } catch (Exception e) {
            return null;
        }
    }
}
