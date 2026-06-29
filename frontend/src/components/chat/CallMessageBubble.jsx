import React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Phone,
  PhoneMissed,
  PhoneOff,
} from "lucide-react";
import { formatCallBubbleDuration } from "@/lib/callHistoryFormat";

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

function resolveSubtype(message) {
  const direct = message.call_subtype || message.subtype;
  if (direct) return direct;

  const st = String(message.call_status || "").toLowerCase();
  if (st === "answered") return "call_answered";
  if (st === "missed") return "call_missed";
  if (st === "declined") return "call_declined";

  const content = (message.content || "").toLowerCase();
  if (content.includes("missed")) return "call_missed";
  if (content.includes("declined")) return "call_declined";
  if (content.includes("voice call") || content.includes("📞")) return "call_answered";
  return "";
}

function resolveDurationSeconds(message) {
  const raw =
    message.duration_seconds ??
    message.last_message_duration_seconds ??
    message.call_duration;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function getConfig(subtype, isOutgoing) {
  if (subtype === "call_answered") {
    return {
      label: "Voice call",
      color: "green",
      showMeta: true,
      callBack: false,
      icon: isOutgoing ? "outgoing" : "incoming",
    };
  }
  if (subtype === "call_missed" && !isOutgoing) {
    return {
      label: "Missed voice call",
      color: "red",
      showMeta: false,
      callBack: true,
      icon: "missed",
    };
  }
  if (subtype === "call_missed" && isOutgoing) {
    return {
      label: "No answer",
      color: "amber",
      showMeta: false,
      callBack: false,
      icon: "outgoing",
    };
  }
  if (subtype === "call_declined" && !isOutgoing) {
    return {
      label: "Declined",
      color: "red",
      showMeta: false,
      callBack: true,
      icon: "declined",
    };
  }
  if (subtype === "call_declined" && isOutgoing) {
    return {
      label: "Call declined",
      color: "amber",
      showMeta: false,
      callBack: false,
      icon: "outgoing",
    };
  }
  return {
    label: "Voice call",
    color: "green",
    showMeta: true,
    callBack: false,
    icon: isOutgoing ? "outgoing" : "incoming",
  };
}

const COLOR = {
  green: {
    icon: "rgba(34,197,94,0.15)",
    text: "#4ade80",
    meta: "rgba(74,222,128,0.5)",
    glyph: "#059669",
    bubble: "#1a2e1f",
    bubbleOut: "#1e4d2b",
    border: "rgba(74,222,128,0.25)",
  },
  red: {
    icon: "rgba(239,68,68,0.15)",
    text: "#f87171",
    meta: "rgba(248,113,113,0.55)",
    glyph: "#e11d48",
    bubble: "#2a1515",
    bubbleOut: "#2a1515",
    border: "rgba(248,113,113,0.35)",
  },
  amber: {
    icon: "rgba(251,191,36,0.12)",
    text: "#fbbf24",
    meta: "rgba(251,191,36,0.45)",
    glyph: "#d97706",
    bubble: "#2a2210",
    bubbleOut: "#2a2210",
    border: "rgba(251,191,36,0.3)",
  },
};

function DirectionGlyph({ type, color, size = 14 }) {
  const style = { width: size, height: size, color, flexShrink: 0 };
  if (type === "missed") {
    return <PhoneMissed style={style} strokeWidth={2} aria-hidden />;
  }
  if (type === "declined") {
    return <PhoneOff style={style} strokeWidth={2} aria-hidden />;
  }
  if (type === "outgoing") {
    return <ArrowUpRight style={style} strokeWidth={2} aria-hidden />;
  }
  if (type === "incoming") {
    return <ArrowDownLeft style={style} strokeWidth={2} aria-hidden />;
  }
  return <Phone style={style} strokeWidth={2} aria-hidden />;
}

export function isCallMessage(message) {
  if (!message) return false;
  return message.message_type === "call" || message.type === "call";
}

export default function CallMessageBubble({ message, currentUserId, onCallBack }) {
  const isOut = String(message.caller_id || message.sender_id) === String(currentUserId);
  const subtype = resolveSubtype(message);
  const cfg = getConfig(subtype, isOut);
  const pal = COLOR[cfg.color];
  const durationSec = resolveDurationSeconds(message);
  const isAnswered =
    subtype === "call_answered" ||
    String(message.call_status || "").toLowerCase() === "answered";
  const dur =
    isAnswered && durationSec != null
      ? formatCallBubbleDuration(durationSec) || (durationSec === 0 ? "0s" : null)
      : null;
  const timestamp = message.created_at || message.timestamp;

  const metaLine = cfg.showMeta
    ? `${isOut ? "Outgoing" : "Incoming"}${dur ? ` · ${dur}` : ""}`
    : null;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isOut ? "flex-end" : "flex-start",
        margin: "2px 8px",
        width: "100%",
      }}
      data-testid={`call-message-${message.id || message.call_id}`}
      data-call-subtype={subtype || "unknown"}
    >
      <div
        style={{
          minWidth: 190,
          maxWidth: "72%",
          padding: "8px 10px",
          borderRadius: isOut ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
          background: isOut ? pal.bubbleOut : pal.bubble,
          border: `1px solid ${pal.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: pal.icon,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <DirectionGlyph type={cfg.icon} color={pal.glyph} size={18} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 13,
                fontWeight: 500,
                color: pal.text,
                lineHeight: 1.3,
              }}
            >
              <DirectionGlyph type={cfg.icon} color={pal.glyph} size={14} />
              <span>{cfg.label}</span>
            </div>

            {dur && (
              <div style={{ fontSize: 11, color: pal.meta, marginTop: 2 }}>{dur}</div>
            )}

            {cfg.showMeta && !dur && (
              <div style={{ fontSize: 11, color: pal.meta, marginTop: 2 }}>{metaLine}</div>
            )}
            {cfg.showMeta && dur && (
              <div style={{ fontSize: 11, color: pal.meta, marginTop: 2 }}>
                {isOut ? "Outgoing" : "Incoming"}
              </div>
            )}
          </div>

          {cfg.callBack && (
            <button
              type="button"
              onClick={() => onCallBack && onCallBack(message)}
              aria-label="Call back"
              data-testid="call-message-callback"
              style={{
                width: 38,
                height: 38,
                minWidth: 44,
                minHeight: 44,
                borderRadius: "50%",
                border: "1px solid rgba(239,68,68,0.3)",
                background: "rgba(239,68,68,0.12)",
                color: "#f87171",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Phone style={{ width: 16, height: 16 }} strokeWidth={2} />
            </button>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 4,
            marginTop: 5,
          }}
        >
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
            {formatTime(timestamp)}
          </span>
          {isOut && <span style={{ fontSize: 10, color: "#4fc3f7" }}>✓✓</span>}
        </div>
      </div>
    </div>
  );
}
