const cleanupFns = new Set();

/** Register interval/timeout cleanup (runs on logout). */
export function registerLogoutCleanup(fn) {
  if (typeof fn === "function") cleanupFns.add(fn);
  return () => cleanupFns.delete(fn);
}

export function runLogoutRegistryCleanup() {
  cleanupFns.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}
