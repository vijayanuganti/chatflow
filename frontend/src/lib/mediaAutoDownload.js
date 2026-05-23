const WIFI_AUTO_IMAGES_KEY = "cf_media_wifi_auto_images";

/** @returns {'wifi'|'cellular'|'unknown'} */
export function getNetworkKind() {
  if (typeof navigator === "undefined") return "unknown";
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return "unknown";
  if (conn.saveData) return "cellular";
  const t = (conn.type || "").toLowerCase();
  if (t === "wifi" || t === "ethernet" || t === "none") return "wifi";
  if (t === "cellular" || t === "wimax") return "cellular";
  if (typeof conn.effectiveType === "string" && conn.effectiveType.includes("2g")) {
    return "cellular";
  }
  return "unknown";
}

export function isWifiAutoDownloadImagesEnabled() {
  try {
    const v = localStorage.getItem(WIFI_AUTO_IMAGES_KEY);
    if (v === "0") return false;
    return true;
  } catch {
    return true;
  }
}

export function setWifiAutoDownloadImages(enabled) {
  try {
    localStorage.setItem(WIFI_AUTO_IMAGES_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Images may auto-cache on Wi‑Fi only; videos and documents are always manual. */
export function shouldAutoDownloadImage() {
  const kind = getNetworkKind();
  if (kind === "cellular") return false;
  if (kind === "wifi") return isWifiAutoDownloadImagesEnabled();
  return isWifiAutoDownloadImagesEnabled() && kind === "unknown";
}
