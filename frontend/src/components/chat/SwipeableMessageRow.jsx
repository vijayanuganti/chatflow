import React, { useRef, cloneElement, isValidElement } from "react";
import { Capacitor } from "@capacitor/core";
import { NO_SELECT_STYLE } from "@/lib/noSelectStyles";

const SWIPE_THRESHOLD = 72;
const MAX_DRAG = 90;

async function triggerHaptic() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* unavailable on web */
  }
}

/**
 * WhatsApp-style swipe-right on the bubble to reply. Disabled in selection mode.
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
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dragXRef = useRef(0);

  const justify = isSent ? "justify-end" : "justify-start";
  const iconSide = isSent ? "left" : "right";

  const resetDrag = () => {
    const bubble = bubbleRef.current;
    const icon = replyIconRef.current;
    if (bubble) {
      bubble.style.transition = "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";
      bubble.style.transform = "translateX(0)";
    }
    if (icon) {
      icon.style.opacity = 0;
      icon.style.transform = "scale(0.6)";
    }
    isDraggingRef.current = false;
    dragXRef.current = 0;
  };

  const onTouchStart = (e) => {
    if (disabled || selectionModeRef?.current) return;
    if (e.touches.length !== 1) return;
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    isDraggingRef.current = false;
    dragXRef.current = 0;
  };

  const onTouchMove = (e) => {
    if (disabled || selectionModeRef?.current) return;
    const bubble = bubbleRef.current;
    const icon = replyIconRef.current;
    if (!bubble || !icon) return;

    const dx = e.touches[0].clientX - startXRef.current;
    const dy = e.touches[0].clientY - startYRef.current;

    if (!isDraggingRef.current && Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) > 10) isDraggingRef.current = true;
    if (!isDraggingRef.current) return;

    e.preventDefault();

    if (dx > 0) {
      const clamped = Math.min(dx, MAX_DRAG);
      dragXRef.current = clamped;
      bubble.style.transform = `translateX(${clamped}px)`;
      bubble.style.transition = "none";
      const progress = clamped / SWIPE_THRESHOLD;
      icon.style.opacity = String(progress);
      icon.style.transform = `scale(${0.6 + 0.4 * progress})`;
    }
  };

  const onTouchEnd = () => {
    if (disabled || selectionModeRef?.current) return;

    const bubble = bubbleRef.current;
    if (!bubble) return;

    const rawTransform = bubble.style.transform || "";
    const fromTransform = parseFloat(rawTransform.replace("translateX(", "")) || 0;
    const currentX = Math.max(fromTransform, dragXRef.current);

    bubble.style.transition = "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";
    bubble.style.transform = "translateX(0)";
    const icon = replyIconRef.current;
    if (icon) {
      icon.style.opacity = "0";
      icon.style.transform = "scale(0.6)";
    }
    isDraggingRef.current = false;
    dragXRef.current = 0;

    if (currentX >= SWIPE_THRESHOLD) {
      void triggerHaptic();
      onSwipeReply?.();
    }
  };

  return (
    <div
      className={`chat-message relative flex w-full overflow-visible ${justify}`}
      style={NO_SELECT_STYLE}
      data-testid="swipeable-message-row"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div className="relative inline-block max-w-full">
        <div
          ref={replyIconRef}
          style={{
            opacity: 0,
            transform: "scale(0.6)",
            transition: "none",
            position: "absolute",
            [iconSide]: -36,
            top: "50%",
            marginTop: -12,
            pointerEvents: "none",
            zIndex: 0,
          }}
          aria-hidden
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#10b981">
            <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
          </svg>
        </div>
        {isValidElement(children) ? cloneElement(children, { bubbleRef }) : children}
      </div>
    </div>
  );
}
