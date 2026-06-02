import React from "react";
import ChatVideoViewer from "@/components/chat/viewers/ChatVideoViewer";
import ChatImageViewer from "@/components/chat/viewers/ChatImageViewer";
import { fileUrl } from "@/lib/api";
import { getMediaPlaybackUrl } from "@/lib/mediaPlaybackUrl";
import { resolveVideoPosterUrl } from "@/lib/videoThumbnailUrl";

/**
 * In-app media modals for photos and videos only.
 * Documents (PDF, Office, etc.) open via the device native viewer — see openDocumentInNativeApp.
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
      viewer.posterUrl ||
      resolveVideoPosterUrl(message) ||
      (url ? resolveVideoPosterUrl({ file_url: url }) : "") ||
      undefined;
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

  return null;
}
