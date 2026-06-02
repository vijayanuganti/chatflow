import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { getMediaPlaybackUrl } from "@/lib/mediaPlaybackUrl";
import { registerOverlayBack } from "@/lib/overlayBackHandler";

/**
 * Full-screen in-app video player (no external "Open with…" intent).
 */
export default function ChatVideoViewer({ open, url, fileName, title, onClose }) {
  const [src, setSrc] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const requestClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open || !url) {
      setSrc("");
      setLoading(false);
      setError("");
      return undefined;
    }
    setLoading(true);
    setError("");
    setSrc(getMediaPlaybackUrl(url));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const unregister = registerOverlayBack(() => requestClose());
    const onKey = (e) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      unregister();
      window.removeEventListener("keydown", onKey);
    };
  }, [open, url, requestClose]);

  if (!open || !url || typeof document === "undefined") return null;

  const label = title || fileName || "Video";

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid="chat-video-viewer"
    >
      <div className="flex shrink-0 items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="truncate text-sm font-medium text-white/90 max-w-[70%]">{label}</p>
        <button
          type="button"
          onClick={requestClose}
          className="rounded-full p-2 text-white hover:bg-white/10 touch-manipulation"
          aria-label="Close"
          data-testid="chat-video-viewer-close"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {loading && !error ? (
          <Loader2 className="h-10 w-10 animate-spin text-white/80" aria-hidden />
        ) : null}
        {error ? (
          <p className="px-4 text-center text-sm text-red-300">{error}</p>
        ) : (
          <video
            key={src}
            src={src}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full w-full rounded-lg bg-black"
            onLoadedData={() => setLoading(false)}
            onCanPlay={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError("Could not play this video. Check your connection and try again.");
            }}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
