import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { COMPANY_PRIMARY } from "@/lib/appInfo";
import { subscribeMediaOpenProgress } from "@/lib/mediaHandler";

const IDLE = { open: false, fileName: "", percent: 0, phase: "idle", onCancel: undefined };

/**
 * Global overlay while a video/document is cached before opening in a native app.
 */
export default function NativeMediaOpenProgress() {
  const [state, setState] = useState(IDLE);

  useEffect(() => subscribeMediaOpenProgress(setState), []);

  if (!state.open) return null;

  const label =
    state.phase === "preparing"
      ? "Preparing to open…"
      : state.phase === "opening"
        ? "Opening…"
        : `Downloading… ${state.percent}%`;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[200] flex justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pointer-events-none"
      data-testid="native-media-open-progress"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {state.fileName || "File"}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
          </div>
          {state.onCancel ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 rounded-full"
              onClick={() => state.onCancel?.()}
              aria-label="Cancel"
              data-testid="native-media-open-cancel"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${Math.max(state.phase === "opening" ? 100 : state.percent, 4)}%`,
              backgroundColor: COMPANY_PRIMARY,
            }}
          />
        </div>
      </div>
    </div>
  );
}
