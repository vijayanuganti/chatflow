import React from "react";
import { Download, Check, FileText } from "lucide-react";
import { formatFileSize } from "@/lib/chatMedia";
import { useChatMediaDownload } from "@/hooks/useChatMediaDownload";
import MediaDownloadRing from "@/components/chat/MediaDownloadRing";

function fileIconColor(mimeType, fileName) {
  const mime = (mimeType || "").toLowerCase();
  const ext = (fileName || "").split(".").pop()?.toLowerCase() || "";
  if (mime.includes("pdf") || ext === "pdf") return "#e11d48";
  if (mime.includes("sheet") || mime.includes("excel") || ["xls", "xlsx", "csv"].includes(ext)) {
    return "#16a34a";
  }
  if (mime.includes("powerpoint") || mime.includes("presentation") || ["ppt", "pptx"].includes(ext)) {
    return "#ea580c";
  }
  if (mime.includes("word") || mime.includes("document") || ["doc", "docx"].includes(ext)) {
    return "#2563eb";
  }
  return "#64748b";
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
  onError,
}) {
  const color = fileIconColor(mimeType, fileName);
  const {
    isDownloaded,
    isDownloading,
    progress,
    onBubbleTap,
  } = useChatMediaDownload({
    url: href,
    fileName,
    mimeType,
    mediaKind: "document",
  });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void onBubbleTap(onError);
        }}
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
            <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
              {fileName || "Document"}
            </p>
            <p className="text-[11px] text-gray-400">
              {formatFileSize(fileSize)}
              {formatFileSize(fileSize) ? " · " : ""}
              {fileExtLabel(fileName)}
            </p>
          </div>
          <span className="relative shrink-0 flex h-9 w-9 items-center justify-center" aria-hidden>
            {isDownloading ? null : isDownloaded ? (
              <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
            ) : (
              <Download className="h-4 w-4 text-gray-500" strokeWidth={1.75} />
            )}
          </span>
        </div>
        {timestampRow ? (
          <div className="message-timestamp-row mt-0.5 pointer-events-none">{timestampRow}</div>
        ) : null}
      </button>
      <MediaDownloadRing
        visible={isDownloading}
        progress={progress}
        onCancel={() => void onBubbleTap(onError)}
        showPercent
        variant="inline"
      />
    </div>
  );
}
