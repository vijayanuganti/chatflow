import React from "react";
import { X } from "lucide-react";

const STROKE = "#064e3b";

function RingButton({ pct, size, onCancel, showPercent }) {
  const r = size === "sm" ? 14 : 22;
  const dim = size === "sm" ? 36 : 52;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const cx = dim / 2;

  return (
    <button
      type="button"
      className="relative flex items-center justify-center touch-manipulation"
      style={{ width: dim, height: dim }}
      onClick={(e) => {
        e.stopPropagation();
        onCancel?.();
      }}
      aria-label={pct < 100 ? `Downloading ${pct}%, tap to cancel` : "Cancel download"}
    >
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} className="-rotate-90" aria-hidden>
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={size === "sm" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.25)"}
          strokeWidth="3"
        />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={STROKE}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      {showPercent ? (
        <span
          className={`absolute font-semibold ${size === "sm" ? "text-[9px] text-gray-800 dark:text-gray-100" : "text-[11px] text-white"}`}
        >
          {pct}%
        </span>
      ) : (
        <X className={`absolute text-white ${size === "sm" ? "h-3 w-3" : "h-4 w-4"}`} />
      )}
    </button>
  );
}

/** WhatsApp-style circular download progress (tap ring to cancel). */
export default function MediaDownloadRing({
  progress = 0,
  visible = true,
  onCancel,
  showPercent = true,
  variant = "overlay",
}) {
  if (!visible) return null;
  const pct = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));

  if (variant === "inline") {
    return (
      <div
        className="pointer-events-auto absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-0.5"
        data-testid="media-download-inline"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <RingButton pct={pct} size="sm" onCancel={onCancel} showPercent={showPercent} />
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center rounded-[12px] bg-black/45"
      data-testid="media-download-overlay"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <RingButton pct={pct} size="md" onCancel={onCancel} showPercent={showPercent} />
    </div>
  );
}
