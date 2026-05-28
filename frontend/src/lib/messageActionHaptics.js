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

/** Light tap when swipe-to-reply crosses the activation threshold. */
export async function hapticSwipeReplyThreshold() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* unavailable on web */
  }
}
