import React from "react";
import { FileText, Download } from "lucide-react";
import { openDocumentExternally } from "@/lib/openDocument";

export default function DocumentMessageBlock({ href, fileName, fileSize, mimeType }) {
  const handleOpen = (e) => {
    e.preventDefault();
    e.stopPropagation();
    void openDocumentExternally(href, fileName, mimeType);
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="flex w-full items-center gap-2 px-3 py-2 bg-white/60 dark:bg-gray-800/60 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800 text-left touch-manipulation"
      data-testid="document-message-block"
    >
      <FileText className="h-5 w-5 text-emerald-800 dark:text-emerald-400 shrink-0" strokeWidth={1.5} />
      <span className="text-sm truncate max-w-[200px] text-gray-900 dark:text-gray-100">{fileName || "file"}</span>
      <Download className="h-4 w-4 text-gray-500 ml-auto shrink-0" strokeWidth={1.5} />
    </button>
  );
}
