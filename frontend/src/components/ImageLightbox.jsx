import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download, Forward } from "lucide-react";
import { registerOverlayBack } from "@/lib/overlayBackHandler";

const DISMISS_DRAG_PX = 72;
const DISMISS_VELOCITY = 0.45;
const HISTORY_FLAG = "__chatflowImageLightbox";

/**
 * Fullscreen in-app image viewer: pinch-to-zoom, pan when zoomed, swipe down to dismiss.
 * Optional download/forward actions; system back closes the viewer first.
 */
export default function ImageLightbox({
  open,
  src,
  alt = "Image",
  onClose,
  onDownload,
  onForward,
  showForward = true,
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragY, setDragY] = useState(0);
  const [dragOpacity, setDragOpacity] = useState(1);
  const pinchRef = useRef(null);
  const historyPushedRef = useRef(false);
  const closingRef = useRef(false);

  const requestClose = useCallback(({ skipHistory = false } = {}) => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose?.();
    if (!skipHistory && historyPushedRef.current) {
      historyPushedRef.current = false;
      try {
        window.history.back();
      } catch {
        /* ignore */
      }
    } else {
      historyPushedRef.current = false;
    }
    window.setTimeout(() => {
      closingRef.current = false;
    }, 0);
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragY(0);
    setDragOpacity(1);
    closingRef.current = false;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, src]);

  useEffect(() => {
    if (!open) return undefined;
    const unregisterOverlay = registerOverlayBack(() => requestClose({ skipHistory: true }));

    try {
      window.history.pushState({ [HISTORY_FLAG]: true }, "");
      historyPushedRef.current = true;
    } catch {
      historyPushedRef.current = false;
    }

    const onPopState = () => {
      requestClose({ skipHistory: true });
    };

    const onKey = (e) => {
      if (e.key === "Escape") requestClose();
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKey);
    return () => {
      unregisterOverlay();
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, requestClose]);

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
        requestClose();
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
  }, [requestClose]);

  if (!open || !src || typeof document === "undefined") return null;

  const imgTransform =
    scale > 1
      ? `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
      : `translateY(${dragY}px) scale(${scale})`;

  const hasActions = Boolean(onDownload) || (showForward && onForward);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="fixed inset-0 z-[9999] flex flex-col justify-between bg-black"
      style={{ backgroundColor: `rgba(0,0,0,${0.95 * dragOpacity})` }}
      onClick={scale <= 1 && dragY < 8 ? requestClose : undefined}
      data-testid="image-lightbox"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          className="pointer-events-auto rounded-full p-2 text-white transition hover:bg-white/10"
          onClick={(e) => {
            e.stopPropagation();
            requestClose();
          }}
          data-testid="image-lightbox-close"
          aria-label="Close"
        >
          <X className="h-6 w-6" strokeWidth={2} />
        </button>
        {hasActions ? (
          <div className="pointer-events-auto flex items-center gap-2">
            {onDownload ? (
              <button
                type="button"
                className="rounded-full p-2 text-white transition hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                data-testid="image-lightbox-download"
                aria-label="Download image"
                title="Download image"
              >
                <Download className="h-6 w-6" strokeWidth={2} />
              </button>
            ) : null}
            {showForward && onForward ? (
              <button
                type="button"
                className="rounded-full p-2 text-white transition hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onForward();
                }}
                data-testid="image-lightbox-forward"
                aria-label="Forward image"
                title="Forward image"
              >
                <Forward className="h-6 w-6" strokeWidth={2} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden touch-none p-2"
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
