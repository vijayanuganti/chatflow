import React from "react";
import { X } from "lucide-react";
import Avatar from "@/components/Avatar";
import { useCall } from "@/context/CallContext";
import { useChat } from "@/context/ChatContext";
import { CALL_STATE } from "@/lib/callConstants";
import { formatCallDuration } from "@/lib/callHistoryFormat";
import "./callOverlay.css";

function QualityBars({ quality }) {
  const heights = [4, 7, 10];
  const visible =
    quality === "good" ? 3 : quality === "fair" ? 2 : quality === "poor" ? 1 : 3;
  return (
    <span className={`call-minimized-quality ${quality || "good"}`} aria-hidden>
      {heights.map((h, i) => (
        <span key={i} style={{ height: h, opacity: i < visible ? 1 : 0.25 }} />
      ))}
    </span>
  );
}

export default function MinimizedCallBadge({ fixedBelowTopBar = false }) {
  const {
    activeCallSession,
    callUiMinimized,
    callState,
    durationSec,
    expandCallUi,
    endActiveCall,
    isCallActive,
    callQuality,
  } = useCall();
  const { activeConversationId } = useChat();

  if (!isCallActive || !callUiMinimized || !activeCallSession) return null;

  const onSameThread =
    activeConversationId &&
    activeCallSession.conversationId &&
    String(activeConversationId) === String(activeCallSession.conversationId);

  if (onSameThread && callState === CALL_STATE.CONNECTED) return null;

  const name = activeCallSession.remoteName || "Contact";
  const avatarUrl = activeCallSession.remoteAvatarUrl || null;
  const timer =
    callState === CALL_STATE.CONNECTED ? formatCallDuration(durationSec) : null;

  const handleBadgeClick = (e) => {
    if (e.target.closest("[data-minimized-end]")) return;
    expandCallUi();
  };

  return (
    <div
      className={`call-minimized-badge ${fixedBelowTopBar ? "call-minimized-badge-fixed" : ""}`}
      data-testid="minimized-call-badge"
      onClick={handleBadgeClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") expandCallUi();
      }}
      role="button"
      tabIndex={0}
    >
      <Avatar
        name={name}
        avatarUrl={avatarUrl}
        size={28}
        variant="dark"
        className="call-minimized-avatar"
      />
      {!avatarUrl ? <span className="call-minimized-pulse" aria-hidden /> : null}
      <span className="call-minimized-badge-text">
        On call · {name}
        {timer ? (
          <>
            {" "}
            · <span className="call-minimized-badge-timer">{timer}</span>
            {callState === CALL_STATE.CONNECTED ? (
              <QualityBars quality={callQuality} />
            ) : null}
          </>
        ) : null}
      </span>
      <button
        type="button"
        className="call-minimized-end"
        data-minimized-end
        onClick={(e) => {
          e.stopPropagation();
          endActiveCall("hangup");
        }}
        aria-label="End call"
        data-testid="minimized-call-end"
      >
        <X />
      </button>
    </div>
  );
}
