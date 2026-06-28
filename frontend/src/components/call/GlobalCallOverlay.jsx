import React from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, MessageCircle } from "lucide-react";
import { useCall } from "@/context/CallContext";
import { CALL_STATE } from "@/lib/callConstants";
import { formatCallDuration } from "@/lib/callHistoryFormat";
import "./callOverlay.css";

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function GlobalCallOverlay() {
  const {
    activeCallSession,
    callUiMinimized,
    callState,
    durationSec,
    isMuted,
    acceptIncomingCall,
    declineIncomingCall,
    endActiveCall,
    returnToCallChat,
    toggleMute,
    toggleSpeaker,
  } = useCall();

  if (!activeCallSession || callUiMinimized) return null;

  const name = activeCallSession.remoteName || "Contact";
  const isIncoming = callState === CALL_STATE.INCOMING;
  const isOutgoing = callState === CALL_STATE.OUTGOING;
  const isConnected = callState === CALL_STATE.CONNECTED;
  const isConnecting = callState === CALL_STATE.CONNECTING;

  let status = "Calling…";
  if (isIncoming) status = "Incoming call";
  if (isConnecting) status = "Connecting…";
  if (isConnected) status = formatCallDuration(durationSec);

  return (
    <div className="call-overlay-root" data-testid="global-call-overlay">
      <div className="call-overlay-avatar">{initials(name)}</div>
      <div className="call-overlay-name">{name}</div>
      <div className="call-overlay-status">{status}</div>

      {isIncoming ? (
        <div className="call-overlay-actions">
          <button
            type="button"
            className="call-overlay-btn call-overlay-btn-decline"
            onClick={declineIncomingCall}
            aria-label="Decline"
            data-testid="call-decline-btn"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
          <button
            type="button"
            className="call-overlay-btn call-overlay-btn-accept"
            onClick={() => void acceptIncomingCall()}
            aria-label="Accept"
            data-testid="call-accept-btn"
          >
            <Phone className="h-7 w-7" />
          </button>
        </div>
      ) : null}

      {(isOutgoing || isConnecting || isConnected) && !isIncoming ? (
        <div className="call-overlay-dock">
          <button type="button" className="call-overlay-dock-btn" onClick={toggleMute}>
            {isMuted ? <MicOff /> : <Mic />}
            <span>{isMuted ? "Unmute" : "Mute"}</span>
          </button>
          <button type="button" className="call-overlay-dock-btn" onClick={toggleSpeaker}>
            <Volume2 />
            <span>Speaker</span>
          </button>
          {isConnected ? (
            <button type="button" className="call-overlay-dock-btn" onClick={returnToCallChat}>
              <MessageCircle />
              <span>Chat</span>
            </button>
          ) : null}
          <button
            type="button"
            className="call-overlay-dock-end"
            onClick={() => endActiveCall("hangup")}
            aria-label="End call"
            data-testid="call-end-btn"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
