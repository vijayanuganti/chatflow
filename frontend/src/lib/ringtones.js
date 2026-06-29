/** ChatFlow built-in ringtones (Web Audio API — no external files). */

/** Close an AudioContext without throwing (handles already-closed + promise rejections). */
export function safeCloseAudioContext(ctx) {
  if (!ctx || ctx.state === "closed") return;
  try {
    const result = ctx.close();
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

const WHATSAPP_FREQS = [440, 480];
const RINGBACK_FREQS = [400, 425];

/**
 * One short dual-tone beep (two frequencies at once).
 * @returns {number} duration in seconds
 */
function scheduleDualToneBeep(ctx, masterGain, startTime, freqs, peakGain) {
  const ATTACK = 0.04;
  const HOLD = 0.22;
  const DECAY = 0.06;
  const TOTAL = ATTACK + HOLD + DECAY;

  freqs.forEach((freq) => {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    oscGain.gain.setValueAtTime(0, startTime);
    oscGain.gain.linearRampToValueAtTime(peakGain, startTime + ATTACK);
    oscGain.gain.setValueAtTime(peakGain, startTime + ATTACK + HOLD);
    oscGain.gain.linearRampToValueAtTime(0, startTime + TOTAL);
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start(startTime);
    osc.stop(startTime + TOTAL + 0.02);
  });

  return TOTAL;
}

/**
 * WhatsApp-style ring cycle: beep-beep (dual tone each), then silence until next cycle.
 * Two frequencies play together on each beep so it sounds like a rich "beep", not a single tone.
 */
export function playWhatsAppRingBurst(ctx, volume = 0.7) {
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume;
  masterGain.connect(ctx.destination);

  const now = ctx.currentTime;
  const peak = 0.42;
  const beepLen = scheduleDualToneBeep(ctx, masterGain, now, WHATSAPP_FREQS, peak);
  const gapBetweenBeeps = 0.16;
  scheduleDualToneBeep(ctx, masterGain, now + beepLen + gapBetweenBeeps, WHATSAPP_FREQS, peak);
}

/** Full ring cycle length in ms (two beeps + long pause before repeat). */
export const WHATSAPP_RING_CYCLE_MS = 2400;

/** How long to keep the AudioContext open per cycle. */
export const WHATSAPP_RING_CTX_CLOSE_MS = 950;

/**
 * Softer ringback for caller: same beep-beep pattern, PSTN-style frequencies.
 */
export function playRingbackBurst(ctx, volume = 0.25) {
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume;
  masterGain.connect(ctx.destination);

  const now = ctx.currentTime;
  const peak = 0.38;
  const beepLen = scheduleDualToneBeep(ctx, masterGain, now, RINGBACK_FREQS, peak);
  scheduleDualToneBeep(ctx, masterGain, now + beepLen + 0.2, RINGBACK_FREQS, peak);
}

export const RINGBACK_CYCLE_MS = 2800;
export const RINGBACK_CTX_CLOSE_MS = 1000;

function generateClassic(ctx) {
  playWhatsAppRingBurst(ctx, 0.7);
}

function generateBreeze(ctx) {
  [330, 440].forEach((freq) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.3);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
    o.start();
    o.stop(ctx.currentTime + 1.2);
  });
}

function generateEcho(ctx) {
  [[880, 0], [440, 0.06]].forEach(([freq, delayTime]) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.5, ctx.currentTime + delayTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delayTime + 0.03);
    o.start(ctx.currentTime + delayTime);
    o.stop(ctx.currentTime + delayTime + 0.05);
  });
}

function generatePulse(ctx) {
  [0, 0.2, 0.4].forEach((delayTime) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "square";
    o.frequency.value = 600;
    g.gain.setValueAtTime(0.15, ctx.currentTime + delayTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delayTime + 0.03);
    o.start(ctx.currentTime + delayTime);
    o.stop(ctx.currentTime + delayTime + 0.04);
  });
}

function generateChime(ctx) {
  [[880, 0], [660, 0.1], [440, 0.2]].forEach(([freq, delayTime]) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.3, ctx.currentTime + delayTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + delayTime + 0.08);
    o.start(ctx.currentTime + delayTime);
    o.stop(ctx.currentTime + delayTime + 0.1);
  });
}

export const CHATFLOW_TONES = [
  { id: "classic", label: "Default", description: "ChatFlow · classic ring", generate: generateClassic },
  { id: "breeze", label: "Breeze", description: "Soft · 0:05", generate: generateBreeze },
  { id: "echo", label: "Echo", description: "Minimal · 0:03", generate: generateEcho },
  { id: "pulse", label: "Pulse", description: "Rhythmic · 0:04", generate: generatePulse },
  { id: "chime", label: "Chime", description: "Bright · 0:04", generate: generateChime },
];

export const TONE_NONE = { id: "none", label: "None", description: "Silent" };

const TONE_PREVIEW_MS = {
  classic: WHATSAPP_RING_CYCLE_MS * 2 + 200,
  breeze: 1400,
  echo: 200,
  pulse: 500,
  chime: 400,
};

/** Short in-app message banner chime (220Hz → 440Hz, ~80ms). */
export function playNotificationSound(volume = 0.5) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
    window.setTimeout(() => {
      safeCloseAudioContext(ctx);
    }, 300);
  } catch {
    /* ignore */
  }
}

export function previewToneOnce(toneId, volume = 0.7) {
  if (toneId === "none") return;

  if (toneId === "classic" || toneId === "whatsapp") {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      playWhatsAppRingBurst(ctx, volume * 0.85);
      window.setTimeout(() => {
        try {
          playWhatsAppRingBurst(ctx, volume * 0.85);
        } catch {
          /* ignore */
        }
      }, WHATSAPP_RING_CYCLE_MS);
      window.setTimeout(() => {
        safeCloseAudioContext(ctx);
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
    tone.generate(ctx);
    const ms = TONE_PREVIEW_MS[tone.id] || 500;
    window.setTimeout(() => {
      safeCloseAudioContext(ctx);
    }, ms + 200);
  } catch {
    /* ignore */
  }
}
