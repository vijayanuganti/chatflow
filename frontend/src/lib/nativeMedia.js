import { Capacitor } from "@capacitor/core";

/**
 * True when running inside the Capacitor native app (iOS / Android).
 */
export function isCapacitorNativeApp() {
  return Capacitor.isNativePlatform();
}

async function photoToFile(photo, opts = {}) {
  const { CameraResultType } = await import("@capacitor/camera");
  const webPath = photo.webPath;
  if (!webPath) throw new Error("No image path from camera");
  const res = await fetch(webPath);
  const blob = await res.blob();
  const ext = photo.format === "png" ? "png" : "jpeg";
  const name = opts.filename || `photo-${Date.now()}.${ext === "jpeg" ? "jpg" : ext}`;
  return new File([blob], name, { type: blob.type || `image/${ext}` });
}

/**
 * Camera shutter — direct capture (no gallery prompt).
 * @param {{ quality?: number }} [opts]
 * @returns {Promise<File>}
 */
export async function capturePhotoFileForUpload(opts = {}) {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const photo = await Camera.getPhoto({
    quality: opts.quality ?? 88,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
  });
  return photoToFile(photo, opts);
}

/**
 * Gallery — pick a single photo from the library.
 * @param {{ quality?: number }} [opts]
 * @returns {Promise<File>}
 */
export async function pickGalleryPhotoFileForUpload(opts = {}) {
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  const photo = await Camera.getPhoto({
    quality: opts.quality ?? 88,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Photos,
  });
  return photoToFile(photo, opts);
}

/**
 * Prompt: camera or gallery (legacy helper).
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
  return photoToFile(photo, opts);
}
