import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { useAuth } from "@/context/AuthContext";

const MIN_SPLASH_MS = 3000;

/**
 * Native splash: white background + spinner for at least 3s, then hide when auth boot finishes.
 */
export default function SplashScreenBootstrap() {
  const { loading } = useAuth();
  const bootStartRef = useRef(Date.now());
  const hiddenRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    bootStartRef.current = Date.now();

    return undefined;
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || loading || hiddenRef.current) return undefined;

    const elapsed = Date.now() - bootStartRef.current;
    const delay = Math.max(0, MIN_SPLASH_MS - elapsed);

    const timer = window.setTimeout(() => {
      hiddenRef.current = true;
      void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {
        /* ignore */
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [loading]);

  return null;
}
