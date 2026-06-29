import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCall } from "@/context/CallContext";
import { playNotificationSound } from "@/lib/ringtones";
import Avatar from "@/components/Avatar";
import {
  subscribeInAppMessageBanner,
  IN_APP_BANNER_DISMISS_EVENT,
} from "@/lib/inAppNotifications";

const DISMISS_MS = 4500;
const SWIPE_THRESHOLD_PX = 100;

export default function InAppMessageBanner() {
  const { user } = useAuth();
  const { ringtoneSettings, startCallForChat } = useCall();
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
    if (!user?.id) return undefined;
    return subscribeInAppMessageBanner((payload) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setIsExiting(false);
      setOffsetX(0);
      setIsDragging(false);
      dragStartXRef.current = null;
      setBanner(payload);
      if (!payload?.isMuted) {
        playNotificationSound(ringtoneSettings?.volume ?? 0.5);
      }
      scheduleAutoDismiss();
    });
  }, [user?.id, scheduleAutoDismiss, ringtoneSettings?.volume]);

  useEffect(() => {
    const onDismiss = () => dismiss();
    window.addEventListener(IN_APP_BANNER_DISMISS_EVENT, onDismiss);
    return () => window.removeEventListener(IN_APP_BANNER_DISMISS_EVENT, onDismiss);
  }, [dismiss]);

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

  const callMsg = banner.message;
  const canCallBack =
    callMsg?.message_type === "call" &&
    (callMsg.call_subtype === "call_missed" || callMsg.call_subtype === "call_declined") &&
    String(callMsg.caller_id) !== String(user?.id);

  const handleCallBack = (e) => {
    e.stopPropagation();
    dismiss();
    const convId = callMsg.conversation_id || banner.conversationId;
    void startCallForChat(convId, callMsg.caller_id, banner.title, banner.avatarUrl || null);
  };

  const opacity = isExiting ? 0 : Math.max(0.35, 1 - Math.abs(offsetX) / 280);

  return (
    <div
      className="fixed inset-x-0 z-[9999] flex justify-center px-3 pointer-events-none notification-viewport-top"
      aria-live="polite"
      data-testid="in-app-message-banner-host"
    >
      <div
        className="pointer-events-auto w-full max-w-md rounded-xl border border-border/80 bg-card/95 shadow-lg backdrop-blur-md animate-banner-drop overflow-hidden"
        style={{
          transform: `translateX(${offsetX}px)`,
          opacity,
          transition: isDragging ? "none" : "transform 0.22s ease-out, opacity 0.22s ease-out",
        }}
      >
        <button
          type="button"
          className="w-full px-4 py-3 text-left touch-pan-y flex items-start gap-3"
          onClick={() => {
            if (isDragging || Math.abs(offsetX) > 8) return;
            banner.onOpen?.();
            dismiss();
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          data-testid="in-app-message-banner"
        >
          {banner.avatarUrl ? (
            <Avatar name={banner.title} avatarUrl={banner.avatarUrl} size={40} className="mt-0.5" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground line-clamp-1">{banner.title}</p>
            {banner.body ? (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{banner.body}</p>
            ) : null}
          </div>
        </button>
        {canCallBack ? (
          <div className="flex border-t border-border/60">
            <button
              type="button"
              className="flex-1 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-muted/50"
              onClick={(e) => {
                e.stopPropagation();
                banner.onOpen?.();
                dismiss();
              }}
            >
              Open chat
            </button>
            <button
              type="button"
              className="flex-1 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-muted/50 border-l border-border/60"
              onClick={handleCallBack}
              data-testid="in-app-banner-call-back"
            >
              Call back
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
