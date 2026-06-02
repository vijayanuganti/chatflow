import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { getMediaAuthHeaders } from "@/lib/api";
import { getMediaPlaybackUrl } from "@/lib/mediaPlaybackUrl";
import { registerOverlayBack } from "@/lib/overlayBackHandler";

/**
 * In-app PDF viewer — streams via authenticated fetch into an embedded iframe (no external app).
 */
export default function ChatPdfViewer({ open, url, fileName, title, onClose }) {
  const [blobUrl, setBlobUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const blobRef = useRef("");

  const requestClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open || !url) return undefined;

    let cancelled = false;
    setLoading(true);
    setError("");

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
  }, [open, url, requestClose]);

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

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex flex-col bg-[#1a1a1a]"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid="chat-pdf-viewer"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#111] px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="truncate text-sm font-medium text-white/90 max-w-[70%]">{label}</p>
        <button
          type="button"
          onClick={requestClose}
          className="rounded-full p-2 text-white hover:bg-white/10 touch-manipulation"
          aria-label="Close"
          data-testid="chat-pdf-viewer-close"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
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
          <iframe
            title={label}
            src={blobUrl}
            className="h-full w-full border-0 bg-white"
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
