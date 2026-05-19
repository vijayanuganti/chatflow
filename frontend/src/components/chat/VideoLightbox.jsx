import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function VideoLightbox({ open, src, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !src) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      data-testid="video-lightbox"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-10 rounded-full bg-black/50 p-2 text-white touch-manipulation"
        aria-label="Close video"
      >
        <X className="h-6 w-6" />
      </button>
      <video
        src={src}
        controls
        autoPlay
        playsInline
        className="max-h-[85vh] max-w-[95vw] w-full"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
