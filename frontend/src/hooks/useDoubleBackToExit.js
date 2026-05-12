import { useCallback, useEffect, useRef } from "react";

/**
 * System back-button hook for SPA "drill-down" navigation.
 *
 * Design:
 *  - We keep a single sentinel `history.pushState` entry on top of whatever
 *    URL React Router currently shows. When the user presses the system Back
 *    button (Android nav gesture, browser back, etc.) the sentinel is popped
 *    and `popstate` fires.
 *  - We call the host `onBack` handler. If it consumes the back press
 *    (returns truthy) we re-push the sentinel so the user stays exactly where
 *    they were — and the *next* back press can drill up one more level.
 *  - If the handler returns falsy (e.g. we're already at the app's "root"
 *    screen), we *still* re-push the sentinel. That intentionally traps the
 *    back press at the root so the user never accidentally lands on the
 *    login page or some stale tab URL still hanging in the browser's
 *    forward/back history. To actually leave the app the user uses the
 *    system home button or task switcher, exactly like a native app.
 *
 *  - No "press back again to exit" toast is shown. Each back press performs
 *    one navigation step.
 *
 * The hook returns a `pushSentinel` function so the host can re-anchor the
 * sentinel after any call that mutates browser history (notably
 * `navigate(..., { replace: true })`, which silently overwrites our sentinel
 * entry).
 *
 * The legacy prop name `onBeforeExitBack` is still accepted so older
 * callers keep working.
 */
const SENTINEL_FLAG = "__chatflowBackSentinel";

function isSentinelState(state) {
  return !!(state && state[SENTINEL_FLAG] === true);
}

export default function useDoubleBackToExit({
  enabled = true,
  onBack,
  onBeforeExitBack,
} = {}) {
  const handlerRef = useRef(onBack || onBeforeExitBack);

  useEffect(() => {
    handlerRef.current = onBack || onBeforeExitBack;
  }, [onBack, onBeforeExitBack]);

  const pushSentinel = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      // Avoid stacking sentinels on top of each other — only push if the
      // current entry isn't already ours.
      if (isSentinelState(window.history.state)) return;
      window.history.pushState({ [SENTINEL_FLAG]: true }, "");
    } catch {
      // Some browsers throttle pushState; safe to ignore.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === "undefined") return undefined;

    pushSentinel();

    const onPopState = () => {
      const handler = handlerRef.current;
      if (typeof handler === "function") {
        try {
          handler();
        } catch (err) {
          console.warn("[useDoubleBackToExit] handler threw:", err);
        }
      }
      // Always re-push the sentinel so back stays trapped to in-app
      // navigation. The host handler is expected to perform whatever
      // drill-up step is appropriate (close a chat, return to overview,
      // etc.). When already at the root screen the handler should be a
      // no-op and the user simply stays put.
      pushSentinel();
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [enabled, pushSentinel]);

  return pushSentinel;
}
