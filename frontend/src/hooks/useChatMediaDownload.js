import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  cancelChatMediaDownload,
  downloadChatMedia,
  isChatMediaCached,
} from "@/lib/chatMediaCache";
import { openDocumentInNativeApp, openVideoInNativeApp } from "@/lib/mediaHandler";

/**
 * WhatsApp-style download state for chat video/document bubbles.
 * @param {{ url: string, fileName?: string, mimeType?: string, mediaKind: 'video'|'document' }} opts
 */
export function useChatMediaDownload({ url, fileName, mimeType, mediaKind }) {
  const [state, setState] = useState("idle");
  const [progress, setProgress] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!url) {
      setState("idle");
      return undefined;
    }
    let cancelled = false;
    isChatMediaCached(url, fileName).then((cached) => {
      if (!cancelled && mountedRef.current) {
        setState(cached ? "downloaded" : "idle");
        if (cached) setProgress(100);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url, fileName]);

  const startDownload = useCallback(async () => {
    if (!url || state === "downloading") return;
    setState("downloading");
    setProgress(0);
    try {
      await downloadChatMedia({
        url,
        fileName,
        onProgress: (pct) => {
          if (mountedRef.current) setProgress(pct);
        },
      });
      if (mountedRef.current) {
        setState("downloaded");
        setProgress(100);
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        if (mountedRef.current) {
          setState("idle");
          setProgress(0);
        }
        return;
      }
      if (mountedRef.current) {
        setState("idle");
        setProgress(0);
      }
      throw err;
    }
  }, [url, fileName, state]);

  const cancelDownload = useCallback(() => {
    cancelChatMediaDownload(url, fileName);
    setState("idle");
    setProgress(0);
  }, [url, fileName]);

  const openInNativeApp = useCallback(
    async (onError) => {
      if (!url) return;
      const open = mediaKind === "video" ? openVideoInNativeApp : openDocumentInNativeApp;
      if (state !== "downloaded" && Capacitor.isNativePlatform()) {
        try {
          setState("downloading");
          await downloadChatMedia({
            url,
            fileName,
            onProgress: (pct) => {
              if (mountedRef.current) setProgress(pct);
            },
          });
          if (mountedRef.current) setState("downloaded");
        } catch (err) {
          if (mountedRef.current) setState("idle");
          onError?.(err?.message || "Download failed");
          return;
        }
      }
      await open(url, fileName, mimeType, onError);
    },
    [url, fileName, mimeType, mediaKind, state],
  );

  const onBubbleTap = useCallback(
    async (onError) => {
      if (state === "downloading") {
        cancelDownload();
        return;
      }
      if (state === "downloaded") {
        await openInNativeApp(onError);
        return;
      }
      try {
        await startDownload();
      } catch (err) {
        onError?.(err?.message || "Download failed. Please check your connection.");
      }
    },
    [state, cancelDownload, openInNativeApp, startDownload],
  );

  return {
    state,
    progress,
    isDownloaded: state === "downloaded",
    isDownloading: state === "downloading",
    startDownload,
    cancelDownload,
    openInNativeApp,
    onBubbleTap,
  };
}
