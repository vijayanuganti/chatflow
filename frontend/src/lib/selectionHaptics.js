import { Capacitor } from "@capacitor/core";

/** Short vibration when entering chat-list selection mode (WhatsApp-style). */
export async function hapticSelectionStart() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    /* plugin unavailable on web / missing package */
  }
}
