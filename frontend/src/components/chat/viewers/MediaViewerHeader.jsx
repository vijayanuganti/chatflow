import React from "react";
import { ChevronLeft, X } from "lucide-react";
import { MV } from "@/components/chat/viewers/mediaViewerTheme";

/**
 * Minimal top bar for in-app media viewers.
 */
export default function MediaViewerHeader({
  title,
  onClose,
  backIcon = "close",
  rightSlot = null,
  className = "",
  testId,
}) {
  const Icon = backIcon === "back" ? ChevronLeft : X;
  const aria = backIcon === "back" ? "Back" : "Close";

  return (
    <header
      className={`flex shrink-0 items-center gap-2 px-3 pb-2 backdrop-blur-md ${className}`}
      style={{
        paddingTop: MV.safeTop,
        background: "linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 70%, transparent 100%)",
      }}
      data-testid={testId}
    >
      <button
        type="button"
        onClick={onClose}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/95 touch-manipulation active:bg-white/10"
        aria-label={aria}
        data-testid={testId ? `${testId}-close` : undefined}
      >
        <Icon className="h-6 w-6" strokeWidth={2} />
      </button>
      <p className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-tight text-white/90">
        {title || ""}
      </p>
      {rightSlot ? <div className="flex shrink-0 items-center gap-1">{rightSlot}</div> : null}
    </header>
  );
}
