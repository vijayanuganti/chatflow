/** Shared tokens for in-app media viewers (WhatsApp-inspired). */
export const MV = {
  accent: "#53bdeb",
  accentMuted: "rgba(83, 189, 235, 0.35)",
  bg: "#0b0b0b",
  headerBg: "rgba(17, 17, 17, 0.92)",
  chrome: "rgba(255, 255, 255, 0.92)",
  chromeDim: "rgba(255, 255, 255, 0.55)",
  track: "rgba(255, 255, 255, 0.28)",
  panel: "rgba(28, 28, 30, 0.88)",
  safeTop: "max(0.75rem, env(safe-area-inset-top))",
  safeBottom: "max(1rem, env(safe-area-inset-bottom))",
};

export function formatMediaTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(r)}`;
  return `${m}:${pad(r)}`;
}
