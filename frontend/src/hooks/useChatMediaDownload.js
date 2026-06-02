import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelChatMediaDownload,
  downloadChatMedia,
  isChatMediaCached,
} from "@/lib/chatMediaCache";
import { coerceMediaRef } from "@/lib/api";
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
  const mediaUrl = coerceMediaRef(url);
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
    if (!mediaUrl) {
      setState("idle");
      return undefined;
    }
    let cancelled = false;
    isChatMediaCached(mediaUrl, fileName).then((cached) => {
      if (!cancelled && mountedRef.current) {
        setState(cached ? "downloaded" : "idle");
        if (cached) setProgress(100);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mediaUrl, fileName]);

  const startDownload = useCallback(async () => {
    if (!mediaUrl || state === "downloading") return;
    setState("downloading");
    setProgress(0);
    try {
      await downloadChatMedia({
        url: mediaUrl,
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
  }, [mediaUrl, fileName, state]);

  const cancelDownload = useCallback(() => {
    cancelChatMediaDownload(mediaUrl, fileName);
    setState("idle");
    setProgress(0);
  }, [mediaUrl, fileName]);

  const openInApp = useCallback(() => {
    if (!mediaUrl || !onOpenInApp || mediaKind !== "video") return false;
    onOpenInApp({
      kind: "video",
      url: mediaUrl,
      fileName,
      mimeType,
      posterUrl: posterUrl || getVideoThumbnailUrl(mediaUrl, { attachToken: true }) || undefined,
    });
    return true;
  }, [mediaUrl, fileName, mimeType, mediaKind, posterUrl, onOpenInApp]);

  const onBubbleTap = useCallback(
    async (onError) => {
      if (state === "downloading") {
        cancelDownload();
        return;
      }

      if (mediaKind === "document") {
        try {
          await openDocumentInNativeApp({
            url: mediaUrl,
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
    [state, cancelDownload, openInApp, startDownload, mediaKind, mediaUrl, fileName, mimeType],
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
