import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Fullscreen in-app image viewer with pinch-to-zoom (touch) and wheel zoom (desktop).
 */
export default function ImageLightbox({ open, src, alt = "Image", onClose }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pinchRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setScale(1);
    setOffset({ x: 0, y: 0 });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, src]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const clampScale = (s) => Math.min(4, Math.max(1, s));

  const onWheel = useCallback((e) => {
    e.preventDefault();
    setScale((s) => clampScale(s + (e.deltaY < 0 ? 0.12 : -0.12)));
  }, []);

  const onTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = { mode: "pinch", dist, scale };
    } else if (e.touches.length === 1 && scale > 1) {
      pinchRef.current = {
        mode: "pan",
        startX: e.touches[0].clientX - offset.x,
        startY: e.touches[0].clientY - offset.y,
      };
    }
  }, [scale, offset]);

  const onTouchMove = useCallback((e) => {
    const p = pinchRef.current;
    if (!p) return;
    if (p.mode === "pinch" && e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setScale(clampScale(p.scale * (dist / p.dist)));
    } else if (p.mode === "pan" && e.touches.length === 1) {
      setOffset({
        x: e.touches[0].clientX - p.startX,
        y: e.touches[0].clientY - p.startY,
      });
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    pinchRef.current = null;
    setScale((s) => {
      if (s <= 1.05) {
        setOffset({ x: 0, y: 0 });
        return 1;
      }
      return s;
    });
  }, []);

  if (!open || !src || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="fixed inset-0 z-[200] flex flex-col bg-black/95"
      onClick={onClose}
      data-testid="image-lightbox"
    >
      <div className="flex shrink-0 items-center justify-end p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="rounded-full text-white hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          data-testid="image-lightbox-close"
          aria-label="Close"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden touch-none"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
          draggable={false}
        />
      </div>
    </div>,
    document.body,
  );
}
