import { Capacitor } from "@capacitor/core";
import { fileUrl } from "@/lib/api";
import { toast } from "sonner";

function guessMimeType(fileName, mimeType) {
  if (mimeType) return mimeType;
  const n = (fileName || "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".doc")) return "application/msword";
  if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".xls")) return "application/vnd.ms-excel";
  if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (n.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  if (n.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (n.endsWith(".txt")) return "text/plain";
  if (n.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        reject(new Error("Could not read file"));
        return;
      }
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(blob);
  });
}

function safeFileName(name) {
  const base = (name || "document").replace(/[/\\?%*:|"<>]/g, "_").trim() || "document";
  return base.slice(0, 120);
}

/**
 * Open a document with the OS default / chooser (Drive, Adobe, PDF viewer).
 * Avoids showing a raw S3/R2 URL inside an in-app browser tab.
 */
export async function openDocumentExternally(pathOrUrl, fileName, mimeType) {
  const url = fileUrl(pathOrUrl);
  if (!url) return;

  const contentType = guessMimeType(fileName, mimeType);
  const name = safeFileName(fileName);

  if (Capacitor.isNativePlatform()) {
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const blob = await response.blob();
      const base64 = await blobToBase64(blob);

      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const path = `chatflow-docs/${Date.now()}-${name}`;
      const written = await Filesystem.writeFile({
        path,
        data: base64,
        directory: Directory.Cache,
      });

      const { FileOpener } = await import("@capacitor-community/file-opener");
      await FileOpener.open({
        filePath: written.uri,
        contentType: blob.type && blob.type !== "application/octet-stream" ? blob.type : contentType,
        openWithDefault: false,
      });
      return;
    } catch (err) {
      console.warn("[openDocument] native open failed", err);
      toast.error("Could not open this file on your device.");
      return;
    }
  }

  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error("Download failed");
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
