import { useCallback, useRef, useState } from "react";

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Pinch-to-zoom + pan when zoomed; optional vertical swipe-to-dismiss at scale 1.
 */
export function usePinchZoomPan({
  minScale = 1,
  maxScale = 4,
  dismissDragPx = 72,
  dismissVelocity = 0.45,
  onDismiss,
} = {}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragY, setDragY] = useState(0);
  const [dragOpacity, setDragOpacity] = useState(1);
  const pinchRef = useRef(null);

  const clampScale = useCallback(
    (s) => clamp(s, minScale, maxScale),
    [minScale, maxScale],
  );

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragY(0);
    setDragOpacity(1);
    pinchRef.current = null;
  }, []);

  const onWheel = useCallback(
    (e) => {
      e.preventDefault();
      setScale((s) => clampScale(s + (e.deltaY < 0 ? 0.1 : -0.1)));
    },
    [clampScale],
  );

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
        } else if (onDismiss) {
          pinchRef.current = {
            mode: "dismiss",
            startY: e.touches[0].clientY,
            lastY: e.touches[0].clientY,
            lastT: Date.now(),
          };
        }
      }
    },
    [scale, offset, onDismiss],
  );

  const onTouchMove = useCallback(
    (e) => {
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
    },
    [clampScale],
  );

  const onTouchEnd = useCallback(() => {
    const p = pinchRef.current;
    pinchRef.current = null;
    if (p?.mode === "dismiss") {
      const dy = Math.max(0, (p.lastY ?? p.startY) - p.startY);
      const dt = Math.max(1, Date.now() - (p.lastT ?? Date.now()));
      const velocity = dy / dt;
      if (dy >= dismissDragPx || velocity > dismissVelocity) {
        onDismiss?.();
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
  }, [dismissDragPx, dismissVelocity, onDismiss]);

  const transform =
    scale > 1
      ? `translate(${offset.x}px, ${offset.y}px) scale(${scale})`
      : `translateY(${dragY}px) scale(${scale})`;

  return {
    scale,
    offset,
    dragY,
    dragOpacity,
    transform,
    reset,
    onWheel,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}
