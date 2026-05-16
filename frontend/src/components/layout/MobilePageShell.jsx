import React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * Full-screen mobile-first page shell (no modal overlay).
 */
export default function MobilePageShell({
  title,
  description,
  backTo,
  onBack,
  children,
  testId = "mobile-page",
  footer,
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
      className="w-full md:max-w-3xl min-h-screen min-h-[100dvh] mx-auto bg-white dark:bg-zinc-900 flex flex-col"
      data-testid={testId}
    >
      <header className="sticky top-0 z-30 border-b border-gray-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-start gap-2 px-4 py-3">
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

      <main className="flex-1 w-full px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-y-auto">
        {children}
      </main>

      {footer ? (
        <footer className="sticky bottom-0 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
