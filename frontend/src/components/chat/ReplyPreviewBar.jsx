import React from "react";
import { useTranslation } from "react-i18next";
import { Reply, X } from "lucide-react";

export default function ReplyPreviewBar({ replyingTo, onCancel }) {
  const { t } = useTranslation();
  if (!replyingTo) return null;

  const borderColor = replyingTo.mine ? "border-emerald-500" : "border-sky-500";

  return (
    <div
      className="mx-2 sm:mx-3 mb-1 flex items-stretch gap-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200/90 dark:border-gray-700 shadow-sm overflow-hidden"
      data-testid="reply-preview-bar"
    >
      <div className="flex shrink-0 items-center pl-2 text-emerald-700 dark:text-emerald-400" aria-hidden>
        <Reply className="h-4 w-4" strokeWidth={2} />
      </div>
      <div className={`flex-1 min-w-0 border-l-[3px] ${borderColor} px-3 py-2`}>
        <p className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 truncate">
          {replyingTo.sender_name || "You"}
        </p>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
          {replyingTo.snippet || ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 px-3 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 touch-manipulation"
        aria-label={t("replyPreview.cancel")}
        data-testid="reply-preview-cancel"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
