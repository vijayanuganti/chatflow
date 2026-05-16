/** Infer API message_type from a File. */
export function inferMessageTypeFromFile(file) {
  const mime = (file?.type || "").toLowerCase();
  const name = (file?.name || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (/\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(name)) return "image";
  if (/\.(mp4|mov|webm|m4v|3gp)$/i.test(name)) return "video";
  if (/\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(name)) return "audio";
  return "file";
}

export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileExtensionLabel(name) {
  const base = (name || "").split(/[\\/]/).pop() || "";
  const ext = base.includes(".") ? base.split(".").pop() : "";
  return (ext || "FILE").toUpperCase().slice(0, 8);
}

export function isPdfFile(name, mime = "") {
  const m = mime.toLowerCase();
  const n = (name || "").toLowerCase();
  return m === "application/pdf" || n.endsWith(".pdf");
}

/** Generate a poster frame data URL from a video File/Blob. */
export function createVideoPosterFromFile(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    const cleanup = () => URL.revokeObjectURL(url);

    const fail = () => {
      cleanup();
      resolve(null);
    };

    video.addEventListener("error", fail, { once: true });
    video.addEventListener(
      "loadeddata",
      () => {
        try {
          const w = video.videoWidth || 640;
          const h = video.videoHeight || 360;
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(video, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          cleanup();
          resolve(dataUrl);
        } catch {
          fail();
        }
      },
      { once: true },
    );
    video.src = url;
    video.currentTime = Math.min(0.25, video.duration || 0.25);
  });
}

/** Stable pseudo-waveform bars for voice UI (deterministic from src). */
export function buildWaveformBars(seedSrc, count = 32) {
  let h = 0;
  const s = String(seedSrc || "voice");
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return Array.from({ length: count }, (_, i) => {
    const v = Math.sin((h + i * 17) * 0.31) * 0.5 + 0.5;
    return 0.25 + v * 0.75;
  });
}
