/**
 * True when running inside the Capacitor native WebView (iOS / Android).
 * Matches @capacitor/core platform detection via injected bridges (no core import).
 */
export function isCapacitorNativeApp() {
  if (typeof window === "undefined") return false;
  if (window.androidBridge) return true;
  const wk = window.webkit?.messageHandlers;
  if (wk?.bridge) return true;
  return false;
}

/**
 * Pick an image via the native camera / photo library and return a `File`
 * suitable for `FormData` uploads to `/upload` (same as `<input type="file">`).
 *
 * @param {{ quality?: number }} [opts]
 * @returns {Promise<File>}
 */
export async function pickPhotoFileForUpload(opts = {}) {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const photo = await Camera.getPhoto({
    quality: opts.quality ?? 88,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Prompt,
  });
  const webPath = photo.webPath;
  if (!webPath) throw new Error("No image path from camera");
  const res = await fetch(webPath);
  const blob = await res.blob();
  const ext = photo.format === "png" ? "png" : "jpeg";
  const name = `photo-${Date.now()}.${ext === "jpeg" ? "jpg" : ext}`;
  return new File([blob], name, { type: blob.type || `image/${ext}` });
}
