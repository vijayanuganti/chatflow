import React from "react";
import { Phone, PhoneOff } from "lucide-react";
import { useCall } from "@/context/CallContext";
import { useChat } from "@/context/ChatContext";
import { CALL_STATE } from "@/lib/callConstants";
import { formatCallDuration } from "@/lib/callHistoryFormat";
import "./callOverlay.css";

export default function MinimizedCallBadge({ fixedBelowTopBar = false }) {
  const {
    activeCallSession,
    callUiMinimized,
    callState,
    durationSec,
    expandCallUi,
    endActiveCall,
    isCallActive,
  } = useCall();
  const { activeConversationId } = useChat();

  if (!isCallActive || !callUiMinimized || !activeCallSession) return null;

  const onSameThread =
    activeConversationId &&
    activeCallSession.conversationId &&
    String(activeConversationId) === String(activeCallSession.conversationId);

  if (onSameThread && callState === CALL_STATE.CONNECTED) return null;

  const name = activeCallSession.remoteName || "Contact";
  const timer =
    callState === CALL_STATE.CONNECTED ? formatCallDuration(durationSec) : "On call";

  return (
    <div
      className={`call-minimized-badge ${fixedBelowTopBar ? "call-minimized-badge-fixed" : ""}`}
      data-testid="minimized-call-badge"
    >
      <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={expandCallUi}>
        <Phone className="h-4 w-4 shrink-0" />
        <span className="truncate text-sm font-medium">
          {name} · {timer}
        </span>
      </button>
      <button
        type="button"
        onClick={() => endActiveCall("hangup")}
        aria-label="End call"
        data-testid="minimized-call-end"
      >
        <PhoneOff className="h-5 w-5" />
      </button>
    </div>
  );
}
