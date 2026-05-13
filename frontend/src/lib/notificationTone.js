/**
 * In-app notification tones for new messages (employee / client / admin).
 * Preference is stored locally per browser profile.
 */

export const NOTIFICATION_TONE_EVENT = "chatflow:notification-tone-changed";

const STORAGE_KEY = "cf_notification_tone";

export const NOTIFICATION_TONES = [
  { id: "off", label: "Off", description: "No sound from ChatFlow for new messages." },
  { id: "soft", label: "Soft", description: "Quiet single note." },
  { id: "ding", label: "Ding", description: "Short, clear alert." },
  { id: "chime", label: "Chime", description: "Three gentle rising notes." },
];

export function getNotificationTone() {
  try {
    const v = (localStorage.getItem(STORAGE_KEY) || "").trim();
    if (NOTIFICATION_TONES.some((t) => t.id === v)) return v;
  } catch {
    /* ignore */
  }
  return "soft";
}

export function setNotificationTone(id) {
  if (!NOTIFICATION_TONES.some((t) => t.id === id)) return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_TONE_EVENT, { detail: { id } }));
  } catch {
    /* ignore */
  }
}

/** When a custom tone plays, OS notifications should stay silent to avoid double beep. */
export function notificationToneSuppressesOsSound() {
  return getNotificationTone() !== "off";
}

let _audioCtx = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_audioCtx) _audioCtx = new AC();
  return _audioCtx;
}

async function resumeContext(ctx) {
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    await ctx.resume().catch(() => {});
  }
  return ctx;
}

function scheduleBeep(ctx, frequency, startTime, durationSec, peakGain) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, startTime);
  const eps = 0.001;
  gain.gain.setValueAtTime(eps, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(peakGain, eps), startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(eps, startTime + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + durationSec + 0.03);
}

/**
 * Play the given preset (or read from storage). Safe to call from WebSocket handlers.
 * @param {string} [toneId]
 * @returns {Promise<void>}
 */
export async function playNotificationTone(toneId) {
  const id = toneId || getNotificationTone();
  if (id === "off") return;
  const ctx = await resumeContext(getAudioContext());
  if (!ctx) return;
  const t0 = ctx.currentTime;
  try {
    if (id === "soft") {
      scheduleBeep(ctx, 523.25, t0, 0.14, 0.055);
    } else if (id === "ding") {
      scheduleBeep(ctx, 880, t0, 0.16, 0.09);
    } else if (id === "chime") {
      scheduleBeep(ctx, 659.25, t0, 0.09, 0.065);
      scheduleBeep(ctx, 830.61, t0 + 0.1, 0.09, 0.065);
      scheduleBeep(ctx, 987.77, t0 + 0.2, 0.11, 0.075);
    }
  } catch {
    /* ignore */
  }
}

/** Play the user's saved tone (for incoming message alerts). */
export function playInboundMessageTone() {
  return playNotificationTone(getNotificationTone());
}
