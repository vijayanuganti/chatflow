import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_DRAG_PX = 72;
const DISMISS_VELOCITY = 0.45;

/**
 * Fullscreen in-app image viewer: pinch-to-zoom, pan when zoomed, swipe down to dismiss.
 */
export default function ImageLightbox({ open, src, alt = "Image", onClose }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragY, setDragY] = useState(0);
  const [dragOpacity, setDragOpacity] = useState(1);
  const pinchRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragY(0);
    setDragOpacity(1);
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

  const onTouchStart = useCallback(
    (e) => {
      if (e.touches.length === 2) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        pinchRef.current = { mode: "pinch", dist, scale };
      } else if (e.touches.length === 1) {
        if (scale > 1) {
          pinchRef.current = {
            mode: "pan",
            startX: e.touches[0].clientX - offset.x,
            startY: e.touches[0].clientY - offset.y,
          };
        } else {
          pinchRef.current = {
            mode: "dismiss",
            startY: e.touches[0].clientY,
            lastY: e.touches[0].clientY,
            lastT: Date.now(),
          };
        }
      }
    },
    [scale, offset],
  );

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
    } else if (p.mode === "dismiss" && e.touches.length === 1) {
      const dy = Math.max(0, e.touches[0].clientY - p.startY);
      p.lastY = e.touches[0].clientY;
      p.lastT = Date.now();
      setDragY(dy);
      setDragOpacity(Math.max(0.35, 1 - dy / 280));
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    const p = pinchRef.current;
    pinchRef.current = null;
    if (p?.mode === "dismiss") {
      const dy = Math.max(0, (p.lastY ?? p.startY) - p.startY);
      const dt = Math.max(1, Date.now() - (p.lastT ?? Date.now()));
      const velocity = dy / dt;
      if (dy >= DISMISS_DRAG_PX || velocity > DISMISS_VELOCITY) {
        onClose?.();
        return;
      }
      setDragY(0);
      setDragOpacity(1);
    }
    setScale((s) => {
      if (s <= 1.05) {
        setOffset({ x: 0, y: 0 });
        return 1;
      }
      return s;
    });
  }, [onClose]);

  if (!open || !src || typeof document === "undefined") return null;

  const imgTransform =
    scale > 1
      ? `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
      : `translateY(${dragY}px) scale(${scale})`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ backgroundColor: `rgba(0,0,0,${0.95 * dragOpacity})` }}
      onClick={scale <= 1 && dragY < 8 ? onClose : undefined}
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
        style={{ touchAction: "manipulation" }}
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
          className="max-h-full max-w-full select-none object-contain transition-transform duration-75"
          style={{
            transform: imgTransform,
            opacity: dragOpacity,
          }}
          draggable={false}
        />
      </div>
    </div>,
    document.body,
  );
}
