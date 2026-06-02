import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { getMediaAuthHeaders } from "@/lib/api";
import { getMediaPlaybackUrl } from "@/lib/mediaPlaybackUrl";
import { registerOverlayBack } from "@/lib/overlayBackHandler";
import MediaViewerHeader from "@/components/chat/viewers/MediaViewerHeader";
import { usePinchZoomPan } from "@/components/chat/viewers/usePinchZoomPan";
import { MV } from "@/components/chat/viewers/mediaViewerTheme";

/**
 * In-app PDF viewer with polished header and pinch-zoom pan on the document surface.
 */
export default function ChatPdfViewer({ open, url, fileName, title, onClose }) {
  const [blobUrl, setBlobUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const blobRef = useRef("");

  const requestClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const {
    scale,
    transform,
    reset,
    onWheel,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  } = usePinchZoomPan({ minScale: 1, maxScale: 3.5 });

  useEffect(() => {
    if (!open || !url) return undefined;

    let cancelled = false;
    setLoading(true);
    setError("");
    reset();

    const fetchUrl = getMediaPlaybackUrl(url);
    const headers = getMediaAuthHeaders();

    void (async () => {
      try {
        const res = await fetch(fetchUrl, { headers });
        if (!res.ok) throw new Error(`Could not load PDF (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        if (blobRef.current) {
          try {
            URL.revokeObjectURL(blobRef.current);
          } catch {
            /* ignore */
          }
        }
        blobRef.current = next;
        setBlobUrl(next);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Could not load PDF.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const unregister = registerOverlayBack(() => requestClose());
    const onKey = (e) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelled = true;
      document.body.style.overflow = prev;
      unregister();
      window.removeEventListener("keydown", onKey);
    };
  }, [open, url, requestClose, reset]);

  useEffect(() => {
    if (open) return undefined;
    if (blobRef.current) {
      try {
        URL.revokeObjectURL(blobRef.current);
      } catch {
        /* ignore */
      }
      blobRef.current = "";
    }
    setBlobUrl("");
    return undefined;
  }, [open]);

  if (!open || !url || typeof document === "undefined") return null;

  const label = title || fileName || "PDF";
  const zoomPct = Math.round(scale * 100);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex flex-col"
      style={{ backgroundColor: MV.bg }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid="chat-pdf-viewer"
    >
      <div
        className="shrink-0 border-b border-white/[0.08]"
        style={{ backgroundColor: MV.headerBg }}
      >
        <MediaViewerHeader
          title={label}
          onClose={requestClose}
          backIcon="back"
          testId="chat-pdf-viewer"
          rightSlot={
            blobUrl && !error ? (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white/70">
                {zoomPct}%
              </span>
            ) : null
          }
        />
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain touch-none"
        style={{ WebkitOverflowScrolling: "touch" }}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-white/70" />
          </div>
        ) : null}
        {error ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-red-300">
            {error}
          </div>
        ) : blobUrl ? (
          <div
            className="flex min-h-full min-w-full items-start justify-center p-2"
            style={{
              transform,
              transformOrigin: "center top",
              transition: scale === 1 ? "transform 80ms ease-out" : undefined,
            }}
          >
            <iframe
              title={label}
              src={blobUrl}
              className="h-[calc(100dvh-4.5rem)] w-full max-w-3xl border-0 bg-white shadow-2xl"
              style={{ minHeight: "70dvh" }}
            />
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
