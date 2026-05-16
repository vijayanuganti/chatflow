import React, { useEffect, useState, useCallback, useRef } from "react";
import { subscribeInAppMessageBanner } from "@/lib/inAppNotifications";

const DISMISS_MS = 4500;
const SWIPE_THRESHOLD_PX = 100;

export default function InAppMessageBanner() {
  const [banner, setBanner] = useState(null);
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef(null);
  const dragStartXRef = useRef(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsExiting(false);
    setOffsetX(0);
    setIsDragging(false);
    dragStartXRef.current = null;
    setBanner(null);
  }, []);

  const dismissWithSwipe = useCallback(
    (direction) => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsExiting(true);
      const offScreen = direction * (typeof window !== "undefined" ? window.innerWidth : 400);
      setOffsetX(offScreen);
      window.setTimeout(dismiss, 220);
    },
    [dismiss],
  );

  const scheduleAutoDismiss = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(dismiss, DISMISS_MS);
  }, [dismiss]);

  useEffect(() => {
    return subscribeInAppMessageBanner((payload) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setIsExiting(false);
      setOffsetX(0);
      setIsDragging(false);
      dragStartXRef.current = null;
      setBanner(payload);
      scheduleAutoDismiss();
    });
  }, [scheduleAutoDismiss]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const onPointerDown = (e) => {
    dragStartXRef.current = e.clientX;
    setIsDragging(true);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (dragStartXRef.current == null) return;
    setOffsetX(e.clientX - dragStartXRef.current);
  };

  const onPointerUp = (e) => {
    if (dragStartXRef.current == null) return;
    const dx = e.clientX - dragStartXRef.current;
    dragStartXRef.current = null;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);

    if (Math.abs(dx) >= SWIPE_THRESHOLD_PX) {
      dismissWithSwipe(dx > 0 ? 1 : -1);
      return;
    }
    setOffsetX(0);
    scheduleAutoDismiss();
  };

  const onPointerCancel = () => {
    dragStartXRef.current = null;
    setIsDragging(false);
    setOffsetX(0);
    scheduleAutoDismiss();
  };

  if (!banner) return null;

  const opacity = isExiting ? 0 : Math.max(0.35, 1 - Math.abs(offsetX) / 280);

  return (
    <button
      type="button"
      className="fixed left-3 right-3 z-[200] mx-auto max-w-md rounded-xl border border-border/80 bg-card/95 px-4 py-3 text-left shadow-lg backdrop-blur-md touch-pan-y"
      style={{
        top: "max(0.75rem, env(safe-area-inset-top, 0px))",
        transform: `translateX(${offsetX}px)`,
        opacity,
        transition: isDragging ? "none" : "transform 0.22s ease-out, opacity 0.22s ease-out",
      }}
      onClick={() => {
        if (isDragging || Math.abs(offsetX) > 8) return;
        banner.onOpen?.();
        dismiss();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      aria-live="polite"
      data-testid="in-app-message-banner"
    >
      <p className="text-sm font-semibold text-foreground line-clamp-1">{banner.title}</p>
      {banner.body ? (
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{banner.body}</p>
      ) : null}
    </button>
  );
}
