export function formatCallDuration(totalSeconds) {
  const sec = Math.max(0, Number(totalSeconds) || 0);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
