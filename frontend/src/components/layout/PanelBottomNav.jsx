import React from "react";

/**
 * Sticky mobile footer nav shared by Client and Employee chat panels.
 */
export default function PanelBottomNav({ items, hidden = false, testId = "panel-bottom-nav" }) {
  if (hidden) return null;
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-20 flex items-stretch justify-around border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(0,0,0,0.06)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 dark:shadow-[0_-4px_18px_rgba(0,0,0,0.5)]"
      data-testid={testId}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = !!item.active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            data-testid={item.testId}
            className="relative flex h-14 min-h-[56px] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 select-none transition-transform active:scale-[0.97]"
          >
            <span
              className={`relative flex items-center justify-center h-7 w-12 rounded-full transition-colors ${
                active
                  ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.7} />
              {item.badge > 0 ? (
                <span
                  className="absolute -top-1 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-semibold flex items-center justify-center border-2 border-white dark:border-gray-950"
                  data-testid={`${item.testId}-badge`}
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </span>
            <span
              className={`text-[10.5px] leading-none ${
                active ? "font-semibold text-emerald-900 dark:text-emerald-300" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
