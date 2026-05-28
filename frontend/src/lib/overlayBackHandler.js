/** @type {{ onClose: () => void; active: boolean }[]} */
const stack = [];

/**
 * Register a fullscreen overlay (lightbox, sheet, etc.) so system back closes it first.
 * @returns {() => void} unregister
 */
export function registerOverlayBack(onClose) {
  const entry = { onClose, active: true };
  stack.push(entry);
  return () => {
    entry.active = false;
    const idx = stack.indexOf(entry);
    if (idx >= 0) stack.splice(idx, 1);
  };
}

/** Close the topmost active overlay; returns true if one was closed. */
export function consumeOverlayBack() {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].active) {
      stack[i].onClose();
      return true;
    }
  }
  return false;
}
