package com.chatflow.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Log;
import android.webkit.MimeTypeMap;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import org.json.JSONObject;

/** Parses ACTION_SEND / ACTION_SEND_MULTIPLE into cache files for the WebView. */
public final class ChatFlowShareIntentHandler {

    private static final String TAG = "ChatFlowShare";
    private static final String CACHE_DIR = "shared_intent";

    private ChatFlowShareIntentHandler() {}

    public static boolean ingest(Context context, Intent intent) {
        if (context == null || intent == null || intent.getAction() == null) {
            return false;
        }
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return false;
        }
        boolean added = false;
        try {
            if (Intent.ACTION_SEND.equals(action)) {
                added = ingestSingle(context, intent);
            } else {
                added = ingestMultiple(context, intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "ingest failed", e);
        }
        return added;
    }

    private static boolean ingestSingle(Context context, Intent intent) {
        String type = intent.getType();
        if (type != null && type.startsWith("text/plain")) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text == null || text.trim().isEmpty()) {
                CharSequence cs = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                text = cs != null ? cs.toString() : null;
            }
            if (text != null && !text.trim().isEmpty()) {
                JSONObject item = new JSONObject();
                try {
                    item.put("id", ChatFlowShareStore.newId());
                    item.put("mimeType", "text/plain");
                    item.put("text", text.trim());
                    item.put("name", "Shared text");
                    item.put("size", text.length());
                    ChatFlowShareStore.add(item);
                    return true;
                } catch (Exception e) {
                    Log.e(TAG, "text share json", e);
                }
            }
        }
        Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri != null) {
            JSONObject item = copyUriToCache(context, uri, type);
            if (item != null) {
                ChatFlowShareStore.add(item);
                return true;
            }
        }
        return false;
    }

    private static boolean ingestMultiple(Context context, Intent intent) {
        java.util.ArrayList<Uri> uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
        if (uris == null || uris.isEmpty()) {
            return false;
        }
        String type = intent.getType();
        boolean any = false;
        for (Uri uri : uris) {
            if (uri == null) {
                continue;
            }
            JSONObject item = copyUriToCache(context, uri, type);
            if (item != null) {
                ChatFlowShareStore.add(item);
                any = true;
            }
        }
        return any;
    }

    private static JSONObject copyUriToCache(Context context, Uri uri, String fallbackMime) {
        ContentResolver resolver = context.getContentResolver();
        String mime = fallbackMime;
        if (mime == null || mime.isEmpty() || "*/*".equals(mime)) {
            mime = resolver.getType(uri);
        }
        if (mime == null) {
            mime = "application/octet-stream";
        }
        String name = queryDisplayName(resolver, uri);
        if (name == null || name.isEmpty()) {
            String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
            name = "shared-" + System.currentTimeMillis() + (ext != null ? "." + ext : "");
        }
        File dir = new File(context.getCacheDir(), CACHE_DIR);
        if (!dir.exists() && !dir.mkdirs()) {
            return null;
        }
        String id = ChatFlowShareStore.newId();
        String safeName = name.replaceAll("[^a-zA-Z0-9._-]", "_");
        File out = new File(dir, id + "_" + safeName);
        long size = 0;
        try (InputStream in = resolver.openInputStream(uri);
                FileOutputStream fos = new FileOutputStream(out)) {
            if (in == null) {
                return null;
            }
            byte[] buf = new byte[8192];
            int read;
            while ((read = in.read(buf)) != -1) {
                fos.write(buf, 0, read);
                size += read;
            }
        } catch (Exception e) {
            Log.e(TAG, "copyUriToCache " + uri, e);
            //noinspection ResultOfMethodCallIgnored
            out.delete();
            return null;
        }
        try {
            JSONObject item = new JSONObject();
            item.put("id", id);
            item.put("path", out.getAbsolutePath());
            item.put("name", name);
            item.put("mimeType", mime);
            item.put("size", size);
            return item;
        } catch (Exception e) {
            Log.e(TAG, "uri json", e);
            return null;
        }
    }

    private static String queryDisplayName(ContentResolver resolver, Uri uri) {
        Cursor c = null;
        try {
            c = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    return c.getString(idx);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "display name query", e);
        } finally {
            if (c != null) {
                c.close();
            }
        }
        return null;
    }
}
