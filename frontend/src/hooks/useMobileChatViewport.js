import { useEffect } from "react";

/**
 * WhatsApp-style mobile chat: lock document scroll and publish a stable shell
 * height for the chat chrome.
 *
 * We intentionally do **not** translate the root by `visualViewport.offsetTop`
 * anymore: the viewport meta includes `interactive-widget=resizes-content`, so
 * the layout viewport already shrinks with the soft keyboard. Combining that
 * with vv offsets made the whole shell (and the focused composer) jump and
 * “blink” mid-screen while the keyboard animated.
 */
export default function useMobileChatViewport() {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const html = document.documentElement;
    const body = document.body;

    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlHeight: html.style.height,
      bodyHeight: body.style.height,
      htmlPosition: html.style.position,
      bodyPosition: body.style.position,
    };

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.height = "100%";
    body.style.height = "100%";

    const vv = window.visualViewport;

    const update = () => {
      // With `interactive-widget=resizes-content`, `innerHeight` tracks the
      // visible area when the keyboard opens. `vv.height` + `offsetTop` would
      // double-apply and fight scroll-into-view on the focused input.
      html.style.setProperty("--visual-vh", `${window.innerHeight}px`);
      html.style.setProperty("--vv-offset-top", "0px");
      html.style.setProperty("--vv-offset-left", "0px");
    };

    update();

    if (vv) {
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
    }
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      html.style.height = prev.htmlHeight;
      body.style.height = prev.bodyHeight;
      html.style.position = prev.htmlPosition;
      body.style.position = prev.bodyPosition;
      html.style.removeProperty("--visual-vh");
      html.style.removeProperty("--vv-offset-top");
      html.style.removeProperty("--vv-offset-left");

      if (vv) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      }
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
}
