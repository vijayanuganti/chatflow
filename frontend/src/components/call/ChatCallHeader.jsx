import React from "react";
import { PhoneOff } from "lucide-react";
import { useCall } from "@/context/CallContext";
import { CALL_STATE } from "@/lib/callConstants";
import { formatCallDuration } from "@/lib/callHistoryFormat";
import "./callOverlay.css";

export default function ChatCallHeader({ conversationId, remoteName }) {
  const { activeCallSession, callState, durationSec, endActiveCall } = useCall();

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

  const label =
    callState === CALL_STATE.CONNECTED
      ? formatCallDuration(durationSec)
      : "Connecting…";

  return (
    <div
      className="call-header-row shrink-0"
      data-testid="chat-call-header"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="flex-1 truncate">
        On call with {remoteName || activeCallSession.remoteName || "contact"} · {label}
      </span>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full bg-emerald-700 px-2 py-1 text-white text-xs"
        onClick={() => endActiveCall("hangup")}
        data-testid="chat-call-header-end"
      >
        <PhoneOff className="h-3.5 w-3.5" />
        End
      </button>
    </div>
  );
}
