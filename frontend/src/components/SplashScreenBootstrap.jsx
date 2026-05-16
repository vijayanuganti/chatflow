import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { Loader2, MessageCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const MIN_SPLASH_MS = 3000;

/**
 * Branded launch screen (icon + ChatFlow wordmark). Native Capacitor splash is hidden
 * as soon as React paints so this overlay is always what the user sees.
 */
export default function SplashScreenBootstrap() {
  const { loading } = useAuth();
  const bootStartRef = useRef(Date.now());
  const hiddenRef = useRef(false);
  const nativeHiddenRef = useRef(false);
  const [visible, setVisible] = useState(() => Capacitor.isNativePlatform());

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    bootStartRef.current = Date.now();

    const hideNative = () => {
      if (nativeHiddenRef.current) return;
      nativeHiddenRef.current = true;
      void SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => {});
    };

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(hideNative);
    });

    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || loading || hiddenRef.current) return undefined;

    const elapsed = Date.now() - bootStartRef.current;
    const delay = Math.max(0, MIN_SPLASH_MS - elapsed);

    const timer = window.setTimeout(() => {
      hiddenRef.current = true;
      setVisible(false);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [loading]);

  if (!Capacitor.isNativePlatform() || !visible) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-white"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="splash-overlay"
    >
      <div className="flex flex-col items-center justify-center flex-1 w-full px-6 -mt-12">
        <div
          className="flex h-[128px] w-[128px] items-center justify-center rounded-[30px] bg-[#064e3b] text-white shadow-lg"
          aria-hidden
        >
          <MessageCircle className="h-[60px] w-[60px]" strokeWidth={2} />
        </div>
        <h1
          className="mt-7 text-center text-[34px] font-semibold leading-tight tracking-tight text-[#064e3b]"
          style={{ fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif" }}
        >
          ChatFlow
        </h1>
        <Loader2
          className="mt-10 h-9 w-9 animate-spin text-[#064e3b]/75"
          aria-label="Loading"
        />
      </div>
    </div>,
    document.body,
  );
}
