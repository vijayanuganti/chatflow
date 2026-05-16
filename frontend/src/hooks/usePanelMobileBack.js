import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";

async function exitNativeApp() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { App } = await import("@capacitor/app");
    await App.exitApp();
  } catch {
    /* ignore */
  }
}

/**
 * Android system back for panel screens (admin dashboard, client chat app).
 * Host `onBack` returns true when it handled the press.
 * `onExitApp` runs when the user is at the panel root (e.g. admin home, client chat list).
 */
export default function usePanelMobileBack({
  enabled = true,
  onBack,
  onExitApp,
} = {}) {
  const handlerRef = useRef(onBack);
  const exitRef = useRef(onExitApp);

  useEffect(() => {
    handlerRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    exitRef.current = onExitApp;
  }, [onExitApp]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === "undefined") return undefined;
    if (!Capacitor.isNativePlatform()) return undefined;

    let remove;
    const ready = import("@capacitor/app").then(({ App }) =>
      App.addListener("backButton", async () => {
        const handler = handlerRef.current;
        if (typeof handler === "function") {
          const handled = handler();
          if (handled) return;
        }
        const exitHandler = exitRef.current;
        if (typeof exitHandler === "function" && exitHandler()) {
          await exitNativeApp();
          return;
        }
        if (window.history.length > 1) {
          window.history.back();
        } else {
          await exitNativeApp();
        }
      }).then((handle) => {
        remove = () => {
          void handle.remove();
        };
      }),
    );

    return () => {
      void ready.finally(() => {
        remove?.();
      });
    };
  }, [enabled]);
}
