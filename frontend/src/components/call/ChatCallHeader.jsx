import React from "react";
import { ChevronUp, PhoneOff, X } from "lucide-react";
import { useCall } from "@/context/CallContext";
import { CALL_STATE } from "@/lib/callConstants";
import { formatCallDuration } from "@/lib/callHistoryFormat";
import "./callOverlay.css";

export default function ChatCallHeader({ conversationId, remoteName }) {
  const {
    activeCallSession,
    callState,
    durationSec,
    endActiveCall,
    expandCallUi,
  } = useCall();

  if (
    !activeCallSession ||
    !conversationId ||
    String(activeCallSession.conversationId) !== String(conversationId)
  ) {
    return null;
  }

  if (callState !== CALL_STATE.CONNECTED && callState !== CALL_STATE.CONNECTING) {
    return null;
  }

  const displayName = remoteName || activeCallSession.remoteName || "contact";
  const timer =
    callState === CALL_STATE.CONNECTED
      ? formatCallDuration(durationSec)
      : "Connecting…";

  return (
    <div
      className="call-header-row shrink-0"
      data-testid="chat-call-header"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <span className="call-header-status truncate">
        <span className="call-header-dot" aria-hidden />
        On call with {displayName}
      </span>
      <span className="call-header-timer">{timer}</span>
      <button
        type="button"
        className="call-header-icon-btn call-header-maximize"
        onClick={(e) => {
          e.stopPropagation();
          expandCallUi();
        }}
        aria-label="Maximize call"
        data-testid="chat-call-header-maximize"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="call-header-icon-btn call-header-end"
        onClick={(e) => {
          e.stopPropagation();
          endActiveCall("hangup");
        }}
        aria-label="End call"
        data-testid="chat-call-header-end"
      >
        <PhoneOff className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
