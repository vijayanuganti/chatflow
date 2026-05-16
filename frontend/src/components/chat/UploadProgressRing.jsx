import React from "react";

/** Semi-translucent circular upload progress over media bubbles. */
export default function UploadProgressRing({ progress = 0, visible = true }) {
  if (!visible) return null;
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/25 backdrop-blur-[1px] transition-opacity duration-300"
      data-testid="upload-progress-overlay"
      style={{ opacity: pct >= 100 ? 0 : 1, pointerEvents: pct >= 100 ? "none" : "auto" }}
    >
      <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-150 ease-out"
        />
      </svg>
      <span className="absolute text-[11px] font-semibold text-white tabular-nums">{pct}%</span>
    </div>
  );
}
