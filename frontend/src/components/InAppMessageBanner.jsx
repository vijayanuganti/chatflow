import React, { useEffect, useState, useCallback, useRef } from "react";
import { subscribeInAppMessageBanner } from "@/lib/inAppNotifications";

const DISMISS_MS = 4500;

export default function InAppMessageBanner() {
  const [banner, setBanner] = useState(null);
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setBanner(null);
  }, []);

  useEffect(() => {
    return subscribeInAppMessageBanner((payload) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setBanner(payload);
      timerRef.current = window.setTimeout(dismiss, DISMISS_MS);
    });
  }, [dismiss]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  if (!banner) return null;

  return (
    <button
      type="button"
      className="fixed left-3 right-3 z-[200] mx-auto max-w-md rounded-xl border border-border/80 bg-card/95 px-4 py-3 text-left shadow-lg backdrop-blur-md animate-in slide-in-from-top-2 duration-200 sm:left-1/2 sm:right-auto sm:-translate-x-1/2"
      style={{ top: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
      onClick={() => {
        banner.onOpen?.();
        dismiss();
      }}
      aria-live="polite"
    >
      <p className="text-sm font-semibold text-foreground line-clamp-1">{banner.title}</p>
      {banner.body ? (
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{banner.body}</p>
      ) : null}
    </button>
  );
}
