export const CALL_STATE = {
  IDLE: "idle",
  OUTGOING: "outgoing",
  INCOMING: "incoming",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  FAILED: "failed",
};

export const CALL_SIGNAL = {
  OFFER: "call-offer",
  RING: "call-ring",
  RINGING: "call-ringing",
  ANSWER: "call-answer",
  ICE: "ice-candidate",
  DECLINE: "call-decline",
  END: "call-end",
  ENDED: "call-ended",
  ERROR: "call-error",
};

export const CALL_INBOUND_TYPES = new Set([
  CALL_SIGNAL.OFFER,
  CALL_SIGNAL.RING,
  CALL_SIGNAL.RINGING,
  CALL_SIGNAL.ANSWER,
  CALL_SIGNAL.ICE,
  CALL_SIGNAL.DECLINE,
  CALL_SIGNAL.END,
  CALL_SIGNAL.ENDED,
  CALL_SIGNAL.ERROR,
]);

export function getDefaultIceServers() {
  try {
    const raw = process.env.REACT_APP_ICE_SERVERS;
    if (raw && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* use default STUN */
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}

export function normalizeSdp(sdp) {
  if (!sdp) return sdp;
  if (typeof sdp === "string") return sdp;
  if (typeof sdp === "object" && sdp.sdp) return sdp.sdp;
  return String(sdp);
}

export function newCallId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
