import { Capacitor } from "@capacitor/core";

/** Haptic feedback when long-pressing a message bubble. */
export async function hapticMessageLongPress() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    /* unavailable on web */
  }
}
