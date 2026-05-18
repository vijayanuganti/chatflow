import { Capacitor } from "@capacitor/core";

/** Android WebViews often report env(safe-area-inset-top) as 0 while content draws under the status bar. */
const ANDROID_MIN_TOP_PX = 48;

/**
 * Sets --app-safe-area-top on the document root for notification banners and toasts.
 */
export function initSafeAreaInsets() {
  if (!Capacitor.isNativePlatform()) return () => {};

  const update = () => {
    const vvTop = window.visualViewport?.offsetTop ?? 0;
    const minTop = Capacitor.getPlatform() === "android" ? ANDROID_MIN_TOP_PX : 36;
    const top = Math.max(vvTop, minTop);
    document.documentElement.style.setProperty("--app-safe-area-top", `${top}px`);
  };

  update();
  const vv = window.visualViewport;
  vv?.addEventListener("resize", update);
  vv?.addEventListener("scroll", update);
  window.addEventListener("orientationchange", update);

  return () => {
    vv?.removeEventListener("resize", update);
    vv?.removeEventListener("scroll", update);
    window.removeEventListener("orientationchange", update);
  };
}
