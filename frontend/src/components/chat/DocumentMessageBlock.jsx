import React from "react";
import { Download, FileText } from "lucide-react";
import { openDocumentExternally } from "@/lib/openDocument";

function fileIconColor(mimeType, fileName) {
  const mime = (mimeType || "").toLowerCase();
  const ext = (fileName || "").split(".").pop()?.toLowerCase() || "";
  if (mime.includes("pdf") || ext === "pdf") return "#e11d48";
  if (mime.includes("sheet") || mime.includes("excel") || ["xls", "xlsx", "csv"].includes(ext)) return "#16a34a";
  if (mime.includes("word") || mime.includes("document") || ["doc", "docx"].includes(ext)) return "#2563eb";
  if (mime.startsWith("image/")) return "#7c3aed";
  return "#64748b";
}

function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!n || Number.isNaN(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtLabel(fileName) {
  const ext = (fileName || "").split(".").pop();
  return ext ? ext.toUpperCase() : "FILE";
}

export default function DocumentMessageBlock({
  href,
  fileName,
  fileSize,
  mimeType,
  timestampRow,
}) {
  const color = fileIconColor(mimeType, fileName);

  const handleOpen = (e) => {
    e.preventDefault();
    e.stopPropagation();
    void openDocumentExternally(href, fileName, mimeType);
  };

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="document-bubble-inner w-full min-w-0 text-left touch-manipulation"
      data-testid="message-document-open"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: color }}
        >
          <FileText className="h-5 w-5 text-white" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{fileName || "Document"}</p>
          <p className="text-[11px] text-gray-400">
            {formatFileSize(fileSize)}
            {formatFileSize(fileSize) ? " · " : ""}
            {fileExtLabel(fileName)}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full p-1.5 text-gray-500"
          aria-hidden
        >
          <Download className="h-4 w-4" strokeWidth={1.75} />
        </span>
      </div>
      {timestampRow ? <div className="message-timestamp-row mt-0.5 pointer-events-none">{timestampRow}</div> : null}
    </button>
  );
}
