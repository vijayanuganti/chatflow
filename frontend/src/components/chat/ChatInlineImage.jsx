import React, { useEffect, useState } from "react";
import { fileUrl } from "@/lib/api";
import { downloadChatMedia, isChatMediaCached } from "@/lib/chatMediaCache";
import { shouldAutoDownloadImage } from "@/lib/mediaAutoDownload";
import UploadProgressRing from "@/components/chat/UploadProgressRing";

/**
 * Inline chat image with blur placeholder and fade-in (WhatsApp-style).
 */
export default function ChatInlineImage({
  fileUrl: path,
  alt,
  onImageClick,
  uploading = false,
  uploadPct = 100,
  mine = false,
  fileName,
}) {
  const src = fileUrl(path);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!src || uploading || mine) return undefined;
    if (!shouldAutoDownloadImage()) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const cached = await isChatMediaCached(path, fileName);
        if (cached || cancelled) return;
        await downloadChatMedia({ url: path, fileName, onProgress: () => {} });
      } catch {
        /* silent background cache */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, path, fileName, uploading, mine]);

  return (
    <div className="relative w-full max-w-full">
      {!loaded && !failed ? (
        <div
          className="block w-full overflow-hidden bg-gray-200 dark:bg-gray-700"
          style={{ minHeight: 120, maxHeight: 300, borderRadius: 12 }}
          aria-hidden
        >
          <img
            src={src}
            alt=""
            className="h-full w-full scale-110 object-cover opacity-60 blur-xl"
            style={{ maxHeight: 300 }}
            aria-hidden
          />
        </div>
      ) : null}
      <button
        type="button"
        className={`block w-full border-0 bg-transparent p-0 cursor-pointer touch-manipulation transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0 absolute inset-0"
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (!uploading && src) onImageClick?.(src, alt);
        }}
        disabled={uploading}
      >
        <img
          src={src}
          alt={alt || "image"}
          className="block h-auto w-full object-cover"
          style={{ maxHeight: 300, borderRadius: 12 }}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true);
            setLoaded(true);
          }}
        />
      </button>
      {failed ? (
        <p className="px-3 py-2 text-xs text-gray-500">Could not load image</p>
      ) : null}
      <UploadProgressRing progress={uploadPct} visible={uploading} />
    </div>
  );
}
