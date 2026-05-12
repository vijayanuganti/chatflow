import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Implements "press back again to exit" on web / TWA / PWA installs.
 *
 * How it works:
 *  - On mount we push one sentinel history entry. The user can then press the
 *    system Back button once and we'll catch the resulting `popstate`.
 *  - On the first back press we show a toast and re-push the sentinel so
 *    the browser stays on the current page.
 *  - If the user presses back again within ~2 seconds we let it through and
 *    the browser actually navigates (which, on Android TWA / PWA, exits to
 *    the home screen).
 *
 * The hook is no-op when `enabled` is false or when run server-side.
 *
 * `onBeforeExitBack` lets the host page handle the back press for in-app
 * drill-downs (closing a chat, employee panel, etc.). If it returns `true`
 * we consume this back press without prompting to exit and re-push the
 * sentinel so further back presses still hit us.
 */
export default function useDoubleBackToExit({
  enabled = true,
  hintMessage = "Press back again to exit",
  windowMs = 2000,
  onBeforeExitBack,
} = {}) {
  const lastPressRef = useRef(0);
  const handlerRef = useRef(onBeforeExitBack);

  useEffect(() => {
    handlerRef.current = onBeforeExitBack;
  }, [onBeforeExitBack]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === "undefined") return undefined;

    const SENTINEL = { __chatflowExitSentinel: true };
    const pushSentinel = () => {
      try {
        window.history.pushState(SENTINEL, "");
      } catch {
        // Ignore: some browsers limit pushState frequency.
      }
    };

    // Seed one extra entry so the user can press back once before we'd
    // actually unload the page.
    pushSentinel();

    const onPopState = () => {
      // Give the host page a chance to handle the back press first (close a
      // chat, deselect an item, etc.).
      const handler = handlerRef.current;
      if (typeof handler === "function") {
        let handled = false;
        try {
          handled = !!handler();
        } catch (err) {
          console.warn("[useDoubleBackToExit] handler threw:", err);
        }
        if (handled) {
          // Consume this back press without prompting to exit.
          pushSentinel();
          lastPressRef.current = 0;
          return;
        }
      }

      const now = Date.now();
      if (lastPressRef.current && now - lastPressRef.current < windowMs) {
        // Second press inside the window: let the browser actually go back.
        lastPressRef.current = 0;
        try {
          window.history.back();
        } catch {
          // ignore
        }
        return;
      }
      lastPressRef.current = now;
      try {
        toast.info(hintMessage);
      } catch {
        // Toaster might not be mounted yet; swallow.
      }
      pushSentinel();
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [enabled, hintMessage, windowMs]);
}
