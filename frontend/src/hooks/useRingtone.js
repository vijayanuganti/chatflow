import { useRef, useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  CHATFLOW_TONES,
  TONE_NONE,
  playWhatsAppRingBurst,
  safeCloseAudioContext,
  WHATSAPP_RING_CYCLE_MS,
  WHATSAPP_RING_CTX_CLOSE_MS,
} from "@/lib/ringtones";

const STORAGE_KEY = "chatflow_ringtone_settings";

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSettings(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function useRingtone() {
  const [settings, setSettings] = useState(() => ({
    toneId: "classic",
    volume: 0.7,
    vibrate: true,
    deviceRingtoneUri: null,
    contactOverrides: {},
    ...loadSettings(),
  }));
  const ringIntervalRef = useRef(null);
  const vibrateIntervalRef = useRef(null);
  const ctxListRef = useRef([]);
  const ringCloseTimeoutsRef = useRef([]);
  const previewCtxRef = useRef(null);
  const previewCloseTimeoutRef = useRef(null);
  const isPlayingRef = useRef(false);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const stopRingtone = useCallback(() => {
    isPlayingRef.current = false;
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    if (vibrateIntervalRef.current) {
      clearInterval(vibrateIntervalRef.current);
      vibrateIntervalRef.current = null;
    }
    ringCloseTimeoutsRef.current.forEach((id) => clearTimeout(id));
    ringCloseTimeoutsRef.current = [];
    if (previewCloseTimeoutRef.current) {
      clearTimeout(previewCloseTimeoutRef.current);
      previewCloseTimeoutRef.current = null;
    }
    if (navigator.vibrate) navigator.vibrate(0);
    ctxListRef.current.forEach((ctx) => safeCloseAudioContext(ctx));
    ctxListRef.current = [];
    if (previewCtxRef.current) {
      safeCloseAudioContext(previewCtxRef.current);
      previewCtxRef.current = null;
    }
    if (Capacitor.isNativePlatform() && window.ChatFlowNative?.stopRingtone) {
      window.ChatFlowNative.stopRingtone().catch(() => {});
    }
  }, []);

  const previewTone = useCallback(
    (toneId) => {
      stopRingtone();
      if (toneId === "none") return;

      if (toneId === "classic" || toneId === "whatsapp") {
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return;
          const ctx = new Ctx();
          previewCtxRef.current = ctx;
          playWhatsAppRingBurst(ctx, (settings.volume ?? 0.7) * 0.85);
          window.setTimeout(() => {
            if (previewCtxRef.current === ctx) {
              playWhatsAppRingBurst(ctx, (settings.volume ?? 0.7) * 0.85);
            }
          }, WHATSAPP_RING_CYCLE_MS);
          previewCloseTimeoutRef.current = window.setTimeout(() => {
            safeCloseAudioContext(ctx);
            if (previewCtxRef.current === ctx) previewCtxRef.current = null;
            previewCloseTimeoutRef.current = null;
          }, WHATSAPP_RING_CYCLE_MS * 2 + 200);
        } catch {
          /* ignore */
        }
        return;
      }

      const tone = CHATFLOW_TONES.find((t) => t.id === toneId);
      if (!tone) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        previewCtxRef.current = ctx;
        tone.generate(ctx);
        previewCloseTimeoutRef.current = window.setTimeout(() => {
          safeCloseAudioContext(ctx);
          if (previewCtxRef.current === ctx) previewCtxRef.current = null;
          previewCloseTimeoutRef.current = null;
        }, 900);
      } catch {
        /* ignore */
      }
    },
    [settings.volume, stopRingtone],
  );

  const startRingtone = useCallback(
    async (callerId) => {
      if (isPlayingRef.current) return;
      isPlayingRef.current = true;

      const overrideToneId = callerId ? settings.contactOverrides?.[callerId] : null;
      const effectiveToneId = overrideToneId || settings.toneId;

      if (settings.vibrate && navigator.vibrate) {
        navigator.vibrate([280, 160, 280, 1680]);
        vibrateIntervalRef.current = setInterval(() => {
          if (isPlayingRef.current) {
            navigator.vibrate([280, 160, 280, 1680]);
          }
        }, WHATSAPP_RING_CYCLE_MS);
      }

      if (effectiveToneId === "none") return;

      if (Capacitor.isNativePlatform() && settings.deviceRingtoneUri) {
        try {
          if (window.ChatFlowNative?.playRingtone) {
            await window.ChatFlowNative.playRingtone({
              uri: settings.deviceRingtoneUri,
              volume: settings.volume,
            });
            return;
          }
        } catch (e) {
          console.warn("Native ringtone failed, falling back to Web Audio:", e);
        }
      }

      const tone = CHATFLOW_TONES.find((t) => t.id === effectiveToneId);
      const useWhatsAppBurst = !tone || effectiveToneId === "classic" || effectiveToneId === "whatsapp";

      const ring = () => {
        if (!isPlayingRef.current) return;
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return;
          const ctx = new Ctx();
          ctxListRef.current.push(ctx);
          if (useWhatsAppBurst) {
            playWhatsAppRingBurst(ctx, settings.volume ?? 0.7);
          } else {
            tone.generate(ctx);
          }
          const closeMs = useWhatsAppBurst ? WHATSAPP_RING_CTX_CLOSE_MS : 1500;
          const timeoutId = window.setTimeout(() => {
            safeCloseAudioContext(ctx);
            ctxListRef.current = ctxListRef.current.filter((c) => c !== ctx);
            ringCloseTimeoutsRef.current = ringCloseTimeoutsRef.current.filter((id) => id !== timeoutId);
          }, closeMs);
          ringCloseTimeoutsRef.current.push(timeoutId);
        } catch (e) {
          console.warn("Ring burst failed:", e);
        }
      };

      ring();
      ringIntervalRef.current = setInterval(ring, useWhatsAppBurst ? WHATSAPP_RING_CYCLE_MS : 3000);
    },
    [settings],
  );

  useEffect(() => () => stopRingtone(), [stopRingtone]);

  return { settings, updateSettings, previewTone, startRingtone, stopRingtone, TONE_NONE, CHATFLOW_TONES };
}
