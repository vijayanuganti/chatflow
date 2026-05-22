import React from "react";
import { useTranslation } from "react-i18next";
import { Pencil, X } from "lucide-react";

export default function EditPreviewBar({ onCancel }) {
  const { t } = useTranslation();
  return (
    <div
      className="mx-2 sm:mx-3 mb-1 flex items-stretch gap-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-700 shadow-sm overflow-hidden"
      data-testid="edit-preview-bar"
    >
      <div className="flex flex-1 min-w-0 items-center gap-2 border-l-[3px] border-primary px-3 py-2">
        <Pencil className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} aria-hidden />
        <p className="text-[11px] font-medium text-primary">{t("editPreview.title")}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 px-3 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 touch-manipulation"
        aria-label={t("editPreview.cancel")}
        data-testid="edit-preview-cancel"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
