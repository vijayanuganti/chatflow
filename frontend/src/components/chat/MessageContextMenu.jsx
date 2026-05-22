import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Star } from "lucide-react";

/**
 * Floating context menu for message actions (Edit / Star).
 * Positioned above or below the anchor depending on viewport space.
 */
export default function MessageContextMenu({
  open,
  anchorRef,
  onClose,
  showEdit,
  isStarred,
  onEdit,
  onToggleStar,
}) {
  const { t } = useTranslation();
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef?.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const menu = menuRef.current;
    const menuH = menu?.offsetHeight || 120;
    const menuW = menu?.offsetWidth || 160;
    const gap = 8;
    let top = anchor.bottom + gap;
    if (top + menuH > window.innerHeight - 12) {
      top = anchor.top - menuH - gap;
    }
    let left = anchor.right - menuW;
    if (left < 12) left = 12;
    if (left + menuW > window.innerWidth - 12) {
      left = window.innerWidth - menuW - 12;
    }
    setPos({ top, left });
  }, [open, anchorRef, showEdit, isStarred]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[200] min-w-[148px] overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
      style={{ top: pos.top, left: pos.left }}
      data-testid="message-context-menu"
    >
      {showEdit ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[14px] text-[#1A1A2E] hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800 touch-manipulation"
            onClick={() => {
              onClose?.();
              onEdit?.();
            }}
            data-testid="message-action-edit"
          >
            <Pencil className="h-4 w-4 shrink-0 text-emerald-800 dark:text-emerald-400" strokeWidth={2} />
            {t("messageMenu.edit")}
          </button>
          <div className="h-px bg-[#E5E7EB] dark:bg-gray-700" aria-hidden />
        </>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[14px] text-[#1A1A2E] hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800 touch-manipulation"
        onClick={() => {
          onClose?.();
          onToggleStar?.();
        }}
        data-testid="message-action-star"
      >
        <Star
          className={`h-4 w-4 shrink-0 ${isStarred ? "fill-amber-400 text-amber-500" : "text-emerald-800 dark:text-emerald-400"}`}
          strokeWidth={2}
        />
        {isStarred ? t("messageMenu.unstar") : t("messageMenu.star")}
      </button>
    </div>
  );
}
