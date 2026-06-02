import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelChatMediaDownload,
  downloadChatMedia,
  isChatMediaCached,
} from "@/lib/chatMediaCache";
import { openDocumentInNativeApp } from "@/lib/mediaHandler";
import { getVideoThumbnailUrl } from "@/lib/videoThumbnailUrl";

/**
 * WhatsApp-style download state for chat video/document bubbles.
 * Videos with `onOpenInApp` use in-app player; documents always open via native "Open with" sheet.
 * @param {{ url: string, fileName?: string, mimeType?: string, mediaKind: 'video'|'document', posterUrl?: string, onOpenInApp?: (payload: object) => void }} opts
 */
export function useChatMediaDownload({
  url,
  fileName,
  mimeType,
  mediaKind,
  posterUrl,
  onOpenInApp,
}) {
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

  const openInApp = useCallback(() => {
    if (!url || !onOpenInApp || mediaKind !== "video") return false;
    onOpenInApp({
      kind: "video",
      url,
      fileName,
      mimeType,
      posterUrl: posterUrl || getVideoThumbnailUrl(url, { attachToken: true }) || undefined,
    });
    return true;
  }, [url, fileName, mimeType, mediaKind, posterUrl, onOpenInApp]);

  const onBubbleTap = useCallback(
    async (onError) => {
      if (state === "downloading") {
        cancelDownload();
        return;
      }

      if (mediaKind === "document") {
        try {
          await openDocumentInNativeApp({
            url,
            fileName,
            mimeType,
            onError: (msg) => onError?.(msg),
          });
          if (mountedRef.current) {
            setState("downloaded");
            setProgress(100);
          }
        } catch (err) {
          onError?.(err?.message || "Could not open document.");
        }
        return;
      }

      if (openInApp()) {
        return;
      }

      if (state === "downloaded") {
        return;
      }

      try {
        await startDownload();
      } catch (err) {
        onError?.(err?.message || "Download failed. Please check your connection.");
      }
    },
    [state, cancelDownload, openInApp, startDownload, mediaKind, url, fileName, mimeType],
  );

  return {
    state,
    progress,
    isDownloaded: state === "downloaded",
    isDownloading: state === "downloading",
    startDownload,
    cancelDownload,
    openInApp,
    onBubbleTap,
  };
}
