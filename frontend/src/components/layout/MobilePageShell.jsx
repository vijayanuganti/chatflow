import React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * Full-screen mobile-first page shell (no modal overlay).
 * Safe-area aware for native Android/iOS WebViews.
 */
export default function MobilePageShell({
  title,
  description,
  backTo,
  onBack,
  children,
  testId = "mobile-page",
  footer,
  /** When true, fills the chat panel content area (desktop sidebar layout) instead of a fixed overlay. */
  embedded = false,
}) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (backTo) {
      navigate(backTo, { replace: false });
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <div
      className={
        embedded
          ? "flex min-h-0 flex-1 flex-col w-full overflow-hidden bg-white dark:bg-zinc-900"
          : "fixed inset-0 z-40 flex flex-col w-full max-w-[100vw] overflow-hidden bg-white dark:bg-zinc-900"
      }
      data-testid={testId}
    >
      <div
        className={`flex flex-col flex-1 min-h-0 w-full ${
          embedded ? "" : "md:max-w-3xl md:mx-auto"
        }`}
      >
        <header className="shrink-0 z-30 border-b border-gray-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
          <div className="flex items-start gap-2 px-4 pb-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 h-11 w-11 rounded-full -ml-1"
              onClick={handleBack}
              aria-label="Go back"
              data-testid={`${testId}-back`}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1 pt-0.5">
              <h1 className="font-display text-lg font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                {title}
              </h1>
              {description ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{description}</p>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
          {children}
        </main>

        {footer ? (
          <footer className="shrink-0 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
