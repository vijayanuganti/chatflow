import { useCallback, useEffect, useRef } from "react";

/**
 * System back-button hook for SPA "drill-down" navigation.
 *
 * Design:
 *  - We keep a single sentinel `history.pushState` entry on top of whatever
 *    URL React Router currently shows. When the user presses the system Back
 *    button (Android nav gesture, browser back, etc.) the sentinel is popped
 *    and `popstate` fires.
 *  - We call the host `onBack` handler. If it returns `{ repushSentinel: false }`,
 *    we do **not** re-push the sentinel so the next Back press can use normal
 *    browser history (e.g. admin drill-down then tab stack).
 *  - If it returns `true` (or other truthy values that are not that object),
 *    we re-push the sentinel so the user stays on the same URL while the
 *    handler performs one drill-up step.
 *  - If the handler returns other falsy (e.g. we're already at the app's
 *    "root" screen for ChatApp), we *still* re-push the sentinel. That
 *    intentionally traps the
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
      let shouldRepush = true;
      if (typeof handler === "function") {
        try {
          const r = handler();
          if (
            r &&
            typeof r === "object" &&
            Object.prototype.hasOwnProperty.call(r, "repushSentinel") &&
            r.repushSentinel === false
          ) {
            shouldRepush = false;
          }
        } catch (err) {
          console.warn("[useDoubleBackToExit] handler threw:", err);
        }
      }
      if (shouldRepush) pushSentinel();
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [enabled, pushSentinel]);

  return pushSentinel;
}
