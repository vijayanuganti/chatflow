import { useEffect, useRef, useState } from "react";
import { coerceMediaRef, getMediaAuthHeaders, mediaFetchUrl } from "@/lib/api";
import { createVideoPosterFromUrl } from "@/lib/chatMedia";
import { getVideoThumbnailUrl } from "@/lib/videoThumbnailUrl";

const blobPosterCache = new Map();

/**
 * Load video cover: local/data poster → API thumbnail (auth fetch) → client frame capture.
 * @param {string} fileUrl
 * @param {string} [initialPoster] - __videoPoster or pre-resolved URL
 */
export function useVideoPoster(fileUrl, initialPoster = "") {
  const [posterSrc, setPosterSrc] = useState(initialPoster || "");
  const genRef = useRef(0);

  useEffect(() => {
    const local = coerceMediaRef(initialPoster);
    const mediaUrl = coerceMediaRef(fileUrl);
    if (local.startsWith("data:") || local.startsWith("blob:")) {
      setPosterSrc(local);
      return undefined;
    }

    if (!mediaUrl || mediaUrl.startsWith("blob:") || mediaUrl.startsWith("data:")) {
      setPosterSrc(local || "");
      return undefined;
    }

    let cancelled = false;
    const gen = ++genRef.current;

    const apply = (src) => {
      if (!cancelled && gen === genRef.current) setPosterSrc(src || "");
    };

    void (async () => {
      const thumbUrl = local || getVideoThumbnailUrl(fileUrl, { attachToken: true });
      if (thumbUrl) {
        const cached = blobPosterCache.get(thumbUrl);
        if (cached) {
          apply(cached);
          return;
        }
        try {
          const res = await fetch(thumbUrl, { headers: getMediaAuthHeaders() });
          if (res.ok) {
            const blob = await res.blob();
            const isImage =
              blob.type.startsWith("image/") ||
              (!blob.type && blob.size > 0);
            if (blob.size > 0 && isImage) {
              const objectUrl = URL.createObjectURL(blob);
              blobPosterCache.set(thumbUrl, objectUrl);
              apply(objectUrl);
              return;
            }
          }
        } catch {
          /* try client capture */
        }
      }

      const dataUrl = await createVideoPosterFromUrl(mediaUrl);
      if (!cancelled && gen === genRef.current) {
        apply(dataUrl || local || "");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileUrl, initialPoster]);

  return posterSrc;
}
