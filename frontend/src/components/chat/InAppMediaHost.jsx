import React from "react";
import ChatVideoViewer from "@/components/chat/viewers/ChatVideoViewer";
import ChatImageViewer from "@/components/chat/viewers/ChatImageViewer";
import ChatPdfViewer from "@/components/chat/viewers/ChatPdfViewer";
import { fileUrl } from "@/lib/api";
import { getMediaPlaybackUrl, isPdfAttachment } from "@/lib/mediaPlaybackUrl";

/**
 * Renders the active in-app media modal (image / video / PDF).
 * @param {{ viewer: object|null, onClose: () => void, onDownload?: () => void, onForward?: () => void, showForward?: boolean }} props
 */
export default function InAppMediaHost({
  viewer,
  onClose,
  onDownload,
  onForward,
  onSaveAndSend,
  showForward = true,
}) {
  if (!viewer) return null;

  const { kind, url, fileName, title, message, alt } = viewer;

  if (kind === "image") {
    const src = viewer.src || getMediaPlaybackUrl(url) || fileUrl(url);
    return (
      <ChatImageViewer
        open
        src={src}
        alt={alt || fileName || "Image"}
        onClose={onClose}
        onDownload={onDownload}
        onForward={onForward}
        onSaveAndSend={onSaveAndSend || viewer.onSaveAndSend}
        showForward={showForward}
        editorToolbar={viewer.editorToolbar ?? true}
      />
    );
  }

  if (kind === "video") {
    const posterUrl =
      viewer.posterUrl || message?.__videoPoster || viewer.poster || undefined;
    return (
      <ChatVideoViewer
        open
        url={url}
        posterUrl={posterUrl}
        fileName={fileName}
        title={title || message?.file_name}
        onClose={onClose}
      />
    );
  }

  if (kind === "pdf" || (kind === "document" && isPdfAttachment(fileName, viewer.mimeType))) {
    return (
      <ChatPdfViewer
        open
        url={url}
        fileName={fileName}
        title={title || fileName}
        onClose={onClose}
      />
    );
  }

  return null;
}
