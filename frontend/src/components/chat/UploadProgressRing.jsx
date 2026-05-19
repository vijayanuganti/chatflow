import React from "react";
import { X } from "lucide-react";

/** WhatsApp-style circular upload progress over media thumbnails. */
export default function UploadProgressRing({ progress = 0, visible = true, onCancel }) {
  if (!visible) return null;
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const r = 20;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center rounded-[12px] bg-black/30"
      data-testid="upload-progress-overlay"
      style={{ pointerEvents: "auto" }}
    >
      <div className="relative flex items-center justify-center">
        <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
          <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
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
          />
        </svg>
        {onCancel ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="absolute flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white touch-manipulation"
            aria-label="Cancel upload"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
