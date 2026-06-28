const DEBUG = process.env.NODE_ENV !== "production";

export function logCallSignal(tag, detail) {
  if (!DEBUG) return;
  try {
    console.debug(`[call] ${tag}`, detail ?? "");
  } catch {
    /* ignore */
  }
}
