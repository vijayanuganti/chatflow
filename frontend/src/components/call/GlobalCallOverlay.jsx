import React, { useState } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  Headphones,
  MessageCircle,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { useCall } from "@/context/CallContext";
import { CALL_STATE } from "@/lib/callConstants";
import { formatConnectedCallTimer } from "@/lib/callHistoryFormat";
import Avatar from "@/components/Avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import "./callOverlay.css";

const QUICK_REPLIES = [
  "Can't talk right now",
  "I'll call you back",
  "On my way",
];

function AvatarBlock({ name, avatarUrl, incoming, connected, callState }) {
  const wrapClass = connected
    ? `call-overlay-avatar-wrap connected ${callState === CALL_STATE.CONNECTED ? "pulsing" : ""}`
    : "call-overlay-avatar-wrap";
  const size = connected ? 72 : 80;
  return (
    <div className={wrapClass}>
      {incoming ? (
        <>
          <span className="call-overlay-ring ring-1" aria-hidden />
          <span className="call-overlay-ring ring-2" aria-hidden />
          <span className="call-overlay-ring ring-3" aria-hidden />
        </>
      ) : null}
      {connected ? (
        <>
          <span className="call-overlay-connected-ring inner" aria-hidden />
          <span className="call-overlay-connected-ring outer" aria-hidden />
        </>
      ) : null}
      <Avatar name={name} avatarUrl={avatarUrl} size={size} variant="dark" />
    </div>
  );
}

function QualityPill() {
  return (
    <div className="call-overlay-quality-pill" aria-hidden>
      <span className="call-overlay-quality-bars">
        <span style={{ height: 4 }} />
        <span style={{ height: 7 }} />
        <span style={{ height: 10 }} />
        <span style={{ height: 13 }} />
      </span>
      <span>HD quality</span>
    </div>
  );
}

export default function GlobalCallOverlay() {
  const {
    activeCallSession,
    callUiMinimized,
    callState,
    durationSec,
    isMuted,
    overlayExiting,
    rtcConnectionState,
    acceptIncomingCall,
    declineIncomingCall,
    endActiveCall,
    returnToCallChat,
    toggleMute,
    outputMode,
    routeTo,
    OUTPUT_MODE,
    remindMeLater,
    sendQuickReplyAndDecline,
  } = useCall();

  const [quickReplyOpen, setQuickReplyOpen] = useState(false);

  if (!activeCallSession || callUiMinimized) return null;

  const name = activeCallSession.remoteName || "Contact";
  const remoteAvatarUrl = activeCallSession.remoteAvatarUrl || null;
  const isIncoming = callState === CALL_STATE.INCOMING;
  const isOutgoing = callState === CALL_STATE.OUTGOING;
  const isConnected = callState === CALL_STATE.CONNECTED;
  const isConnecting = callState === CALL_STATE.CONNECTING;
  const showConnectedLayout = (isOutgoing || isConnecting || isConnected) && !isIncoming;

  const rootClass = [
    "call-overlay-root",
    isIncoming ? "call-overlay-incoming" : "",
    showConnectedLayout ? "call-overlay-connected-layout" : "",
    overlayExiting ? "call-overlay-exiting" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleSpeakerClick = async () => {
    if (outputMode === OUTPUT_MODE.SPEAKER) {
      await routeTo(OUTPUT_MODE.EARPIECE);
      return;
    }
    await routeTo(OUTPUT_MODE.SPEAKER);
  };

  const handleBluetoothClick = async () => {
    if (outputMode === OUTPUT_MODE.BLUETOOTH) {
      await routeTo(OUTPUT_MODE.EARPIECE);
      return;
    }
    const result = await routeTo(OUTPUT_MODE.BLUETOOTH);
    if (!result?.ok) {
      toast.message("No Bluetooth device found", { duration: 2000 });
    }
  };

  const handleQuickReplySelect = (text, autoSend) => {
    setQuickReplyOpen(false);
    void sendQuickReplyAndDecline(text, { autoSend });
  };

  return (
    <>
      <div className={rootClass} data-testid="global-call-overlay">
        <div className="call-overlay-top">
          <AvatarBlock
            name={name}
            avatarUrl={remoteAvatarUrl}
            incoming={isIncoming}
            connected={showConnectedLayout}
            callState={callState}
          />
          <div className={`call-overlay-name ${showConnectedLayout ? "connected-name" : ""}`}>
            {name}
          </div>

          {isIncoming ? (
            <div className="call-overlay-status">ChatFlow audio call</div>
          ) : isConnected ? (
            <>
              <div className="call-overlay-encrypted">
                <span className="call-overlay-encrypted-dot" aria-hidden />
                End-to-end encrypted
              </div>
              <div className="call-overlay-timer connected-timer">
                {formatConnectedCallTimer(durationSec)}
              </div>
              <div className="call-overlay-waveform" aria-hidden>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <span key={i} />
                ))}
              </div>
              {rtcConnectionState === "connected" ? <QualityPill /> : null}
            </>
          ) : (
            <div className="call-overlay-status">
              {isConnecting ? "Connecting…" : "Calling…"}
            </div>
          )}
        </div>

        {isIncoming ? (
          <>
            <div className="call-overlay-quick-row">
              <button
                type="button"
                className="call-overlay-quick-btn"
                onClick={remindMeLater}
                data-testid="call-remind-btn"
              >
                <Bell />
                Remind me
              </button>
              <button
                type="button"
                className="call-overlay-quick-btn"
                onClick={() => setQuickReplyOpen(true)}
                data-testid="call-send-message-btn"
              >
                <MessageCircle />
                Send message
              </button>
            </div>
            <div className="call-overlay-actions">
              <div className="call-overlay-action-col">
                <button
                  type="button"
                  className="call-overlay-btn call-overlay-btn-decline"
                  onClick={declineIncomingCall}
                  aria-label="Decline"
                  data-testid="call-decline-btn"
                >
                  <PhoneOff />
                </button>
                <span className="call-overlay-action-label">Decline</span>
              </div>
              <div className="call-overlay-action-col">
                <button
                  type="button"
                  className="call-overlay-btn call-overlay-btn-accept"
                  onClick={() => void acceptIncomingCall()}
                  aria-label="Accept"
                  data-testid="call-accept-btn"
                >
                  <Phone />
                </button>
                <span className="call-overlay-action-label">Accept</span>
              </div>
            </div>
          </>
        ) : null}

        {showConnectedLayout ? (
          <div className="call-overlay-dock-v2">
            <div className="call-overlay-dock-row-v2">
              {[
                {
                  key: "mute",
                  label: isMuted ? "Unmute" : "Mute",
                  active: isMuted,
                  activeClass: "active-mute",
                  onClick: toggleMute,
                  icon: isMuted ? <MicOff /> : <Mic />,
                },
                {
                  key: "speaker",
                  label: "Speaker",
                  active: outputMode === OUTPUT_MODE.SPEAKER,
                  activeClass: "active-speaker",
                  onClick: () => void handleSpeakerClick(),
                  icon: <Volume2 />,
                },
                {
                  key: "bt",
                  label: "Bluetooth",
                  active: outputMode === OUTPUT_MODE.BLUETOOTH,
                  activeClass: "active-bt",
                  onClick: () => void handleBluetoothClick(),
                  icon: <Headphones />,
                },
                {
                  key: "chat",
                  label: "Chat",
                  active: false,
                  activeClass: "",
                  onClick: returnToCallChat,
                  icon: <MessageCircle />,
                },
              ].map((btn) => (
                <div key={btn.key} className="call-overlay-dock-col-v2">
                  <button
                    type="button"
                    className={`call-overlay-circle-btn ${btn.active ? btn.activeClass : ""}`}
                    onClick={btn.onClick}
                  >
                    {btn.icon}
                  </button>
                  <span className="call-overlay-dock-label-v2">{btn.label}</span>
                </div>
              ))}
            </div>
            <div className="call-overlay-dock-end-row">
              <button
                type="button"
                className="call-overlay-circle-btn end-call"
                onClick={() => endActiveCall("hangup")}
                aria-label="End call"
                data-testid="call-end-btn"
              >
                <PhoneOff />
              </button>
              <span className="call-overlay-dock-label-v2">End</span>
            </div>
          </div>
        ) : null}
      </div>

      <Sheet open={quickReplyOpen} onOpenChange={setQuickReplyOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Send a quick reply</SheetTitle>
          </SheetHeader>
          <div className="call-quick-sheet">
            {QUICK_REPLIES.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => handleQuickReplySelect(text, true)}
              >
                {text}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleQuickReplySelect("", false)}
            >
              Custom…
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
