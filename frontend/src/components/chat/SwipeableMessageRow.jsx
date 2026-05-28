import React, { useRef, cloneElement, isValidElement } from "react";
import { Reply } from "lucide-react";
import { NO_SELECT_STYLE } from "@/lib/noSelectStyles";
import { hapticSwipeReplyThreshold } from "@/lib/messageActionHaptics";

const SWIPE_THRESHOLD = 50;
const MAX_DRAG = 80;
const LOCK_PX = 10;

/**
 * WhatsApp-style swipe-right on the bubble to reply.
 * Pointer events (touch + mouse) with vertical-scroll pass-through.
 */
export default function SwipeableMessageRow({
  children,
  onSwipeReply,
  disabled = false,
  isSent = false,
  selectionModeRef,
}) {
  const bubbleRef = useRef(null);
  const replyIconRef = useRef(null);
  const startRef = useRef({ x: 0, y: 0 });
  const lockedHorizontalRef = useRef(false);
  const dragXRef = useRef(0);
  const activePointerIdRef = useRef(null);
  const thresholdHapticFiredRef = useRef(false);

  const justify = isSent ? "justify-end" : "justify-start";

  const applyTransform = (x) => {
    const bubble = bubbleRef.current;
    const icon = replyIconRef.current;
    if (!bubble) return;
    const clamped = Math.min(Math.max(0, x), MAX_DRAG);
    dragXRef.current = clamped;
    bubble.style.transform = `translateX(${clamped}px)`;
    if (icon) {
      const progress = Math.min(clamped / SWIPE_THRESHOLD, 1);
      icon.style.opacity = String(progress);
      icon.style.transform = `scale(${0.55 + 0.45 * progress})`;
    }
    if (
      clamped >= SWIPE_THRESHOLD &&
      !thresholdHapticFiredRef.current &&
      lockedHorizontalRef.current
    ) {
      thresholdHapticFiredRef.current = true;
      void hapticSwipeReplyThreshold();
    }
  };

  const resetDrag = (animate = true) => {
    const bubble = bubbleRef.current;
    const icon = replyIconRef.current;
    if (bubble) {
      bubble.style.transition = animate
        ? "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
        : "none";
      bubble.style.transform = "translateX(0)";
    }
    if (icon) {
      icon.style.transition = animate ? "opacity 0.2s ease, transform 0.2s ease" : "none";
      icon.style.opacity = "0";
      icon.style.transform = "scale(0.55)";
    }
    lockedHorizontalRef.current = false;
    dragXRef.current = 0;
    activePointerIdRef.current = null;
    thresholdHapticFiredRef.current = false;
  };

  const finishDrag = () => {
    const triggered = dragXRef.current >= SWIPE_THRESHOLD;
    resetDrag(true);
    if (triggered) {
      onSwipeReply?.();
    }
  };

  const onPointerDown = (e) => {
    if (disabled || selectionModeRef?.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (activePointerIdRef.current != null) return;

    activePointerIdRef.current = e.pointerId;
    startRef.current = { x: e.clientX, y: e.clientY };
    lockedHorizontalRef.current = false;
    dragXRef.current = 0;
    thresholdHapticFiredRef.current = false;

    const bubble = bubbleRef.current;
    if (bubble) bubble.style.transition = "none";

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = (e) => {
    if (disabled || selectionModeRef?.current) return;
    if (activePointerIdRef.current !== e.pointerId) return;

    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;

    if (!lockedHorizontalRef.current) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      if (Math.abs(dy) >= Math.abs(dx)) return;
      if (dx <= 0) return;
      lockedHorizontalRef.current = true;
    }

    if (dx <= 0) {
      applyTransform(0);
      return;
    }

    if (e.cancelable) e.preventDefault();
    applyTransform(dx);
  };

  const onPointerUp = (e) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (lockedHorizontalRef.current && dragXRef.current > 0) {
      finishDrag();
    } else {
      resetDrag(true);
    }
  };

  const onPointerCancel = (e) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    resetDrag(true);
  };

  const child =
    isValidElement(children) ? cloneElement(children, { bubbleRef }) : children;

  return (
    <div
      className={`chat-message relative flex w-full min-w-0 overflow-visible touch-pan-y ${justify}`}
      style={{ ...NO_SELECT_STYLE, touchAction: "pan-y" }}
      data-testid="swipeable-message-row"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div className="relative inline-block max-w-[65%] md:max-w-[55%]">
        <div
          ref={replyIconRef}
          style={{
            opacity: 0,
            transform: "scale(0.55)",
            transition: "none",
            position: "absolute",
            left: -40,
            top: "50%",
            marginTop: -14,
            pointerEvents: "none",
            zIndex: 0,
          }}
          aria-hidden
        >
          <Reply className="h-7 w-7 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
        </div>
        {child}
      </div>
    </div>
  );
}
