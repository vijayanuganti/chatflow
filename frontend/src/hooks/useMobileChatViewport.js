import { useEffect } from "react";

/**
 * WhatsApp-style mobile chat layout fix.
 *
 * Two things go wrong when the soft keyboard opens on Android Chrome / iOS
 * Safari and they have to be solved together:
 *
 *   1. `html` / `body` are allowed to scroll. When the user taps the chat
 *      composer the browser does `scrollIntoView` on the input and walks up
 *      looking for any scrollable ancestor — finding `body`, it pushes the
 *      whole layout up so the chat header scrolls off the top.
 *
 *   2. `100dvh` (and friends) isn't perfectly reliable. On some browsers it
 *      doesn't update fast enough when the keyboard opens/closes, so the
 *      flex layout briefly overflows the visible area, which again lets the
 *      browser shift things around.
 *
 * This hook does both: it pins `html` and `body` to the visual viewport while
 * the chat screen is mounted, and it publishes the visual viewport height as
 * a CSS variable `--visual-vh` that the root container reads. The chat
 * window's own `flex` + `overflow-auto` then keeps the header pinned and
 * scrolls only the message list, exactly like WhatsApp.
 *
 * Safe to call on every render; the effect cleans up on unmount and never
 * mutates user content.
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

    // Stop body from scrolling on input focus / safari rubber-band.
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.height = "100%";
    body.style.height = "100%";

    const vv = window.visualViewport;

    const update = () => {
      const h = vv ? vv.height : window.innerHeight;
      html.style.setProperty("--visual-vh", `${h}px`);
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

      if (vv) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      }
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
}
