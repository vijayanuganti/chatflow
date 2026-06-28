import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { CALL_STATE } from "@/lib/callConstants";
import { callSignalListenerRef } from "@/lib/callSignalBridge";
import { logCallSignal } from "@/lib/callSignalingLog";
import { useChatSocketContext } from "@/context/ChatSocketContext";
import useAudioCall from "@/hooks/useAudioCall";

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const { sendSignal, ensureHealthy } = useChatSocketContext();
  const remoteAudioRef = useRef(null);
  const navigateToConversationRef = useRef(null);
  const activeCallIdRef = useRef(null);
  const inboundQueueRef = useRef([]);

  const [activeCallSession, setActiveCallSession] = useState(null);
  const [session, setSession] = useState(null);
  const [callUiMinimized, setCallUiMinimized] = useState(false);
  const [inboundSignalTick, setInboundSignalTick] = useState(0);

  const clearCallSession = useCallback(() => {
    setActiveCallSession(null);
    setSession(null);
    setCallUiMinimized(false);
    inboundQueueRef.current = [];
    activeCallIdRef.current = null;
  }, []);

  const onCallError = useCallback((reason) => {
    const messages = {
      callee_offline:
        "Contact is offline. They need ChatFlow open in their browser to receive your call.",
      forbidden: "You can't place a call in this conversation.",
      invalid_offer: "Could not start the call. Please try again.",
    };
    toast.error(messages[reason] || "Call could not be connected.");
  }, []);

  const onCallEnded = useCallback(() => {
    clearCallSession();
  }, [clearCallSession]);

  const audio = useAudioCall({
    session,
    activeCallIdRef,
    sendSignal,
    ensureHealthy,
    inboundSignalTick,
    inboundQueueRef,
    remoteAudioRef,
    onCallEnded,
    onCallError,
  });

  const onCallSignalReceived = useCallback((frame) => {
    inboundQueueRef.current.push(frame);
    logCallSignal("session.queue", frame?.type);

    if (frame?.type === "call-offer") {
      setSession({
        conversationId: frame.conversation_id,
        remoteUserId: frame.caller_id,
        remoteName: frame.caller_name || "Caller",
      });
      setActiveCallSession({
        callId: frame.call_id,
        conversationId: frame.conversation_id,
        remoteUserId: frame.caller_id,
        remoteName: frame.caller_name || "Caller",
        direction: "incoming",
      });
      setCallUiMinimized(false);
    } else if (frame?.type === "call-ring" && frame.call_id) {
      setSession((prev) =>
        prev?.conversationId
          ? prev
          : {
              conversationId: frame.conversation_id,
              remoteUserId: frame.caller_id,
              remoteName: frame.caller_name || "Caller",
            },
      );
      setActiveCallSession((prev) =>
        prev?.callId
          ? prev
          : {
              callId: frame.call_id,
              conversationId: frame.conversation_id,
              remoteUserId: frame.caller_id,
              remoteName: frame.caller_name || "Caller",
              direction: "incoming",
            },
      );
    }
    setInboundSignalTick((t) => t + 1);
  }, []);

  callSignalListenerRef.current = onCallSignalReceived;

  const registerNavigateToConversation = useCallback((fn) => {
    navigateToConversationRef.current = fn;
  }, []);

  const startCallForChat = useCallback(
    async (conversationId, remoteUserId, remoteName) => {
      if (audio.callState !== CALL_STATE.IDLE) return false;
      const nextSession = { conversationId, remoteUserId, remoteName };
      setSession(nextSession);
      setActiveCallSession({
        callId: null,
        conversationId,
        remoteUserId,
        remoteName,
        direction: "outgoing",
      });
      setCallUiMinimized(false);
      const ok = await audio.startCall(nextSession);
      if (!ok) {
        clearCallSession();
        toast.error("Could not start the call. Check microphone permission and try again.");
      }
      return ok;
    },
    [audio, clearCallSession],
  );

  const acceptIncomingCall = useCallback(async () => {
    setCallUiMinimized(false);
    const ok = await audio.acceptCall();
    if (ok && activeCallSession?.conversationId) {
      navigateToConversationRef.current?.(activeCallSession.conversationId);
    }
    return ok;
  }, [audio, activeCallSession]);

  const declineIncomingCall = useCallback(() => {
    audio.declineCall("declined");
  }, [audio]);

  const endActiveCall = useCallback(
    (reason = "hangup") => {
      audio.endCall(reason);
    },
    [audio],
  );

  const minimizeCallUi = useCallback(() => setCallUiMinimized(true), []);
  const expandCallUi = useCallback(() => setCallUiMinimized(false), []);

  const returnToCallChat = useCallback(() => {
    if (activeCallSession?.conversationId) {
      navigateToConversationRef.current?.(activeCallSession.conversationId);
    }
    setCallUiMinimized(true);
  }, [activeCallSession]);

  const value = useMemo(
    () => ({
      activeCallSession,
      session,
      callUiMinimized,
      callState: audio.callState,
      durationSec: audio.durationSec,
      isMuted: audio.isMuted,
      speakerOn: audio.speakerOn,
      startCallForChat,
      acceptIncomingCall,
      declineIncomingCall,
      endActiveCall,
      minimizeCallUi,
      expandCallUi,
      returnToCallChat,
      registerNavigateToConversation,
      toggleMute: audio.toggleMute,
      toggleSpeaker: audio.toggleSpeaker,
      remoteAudioRef,
      isCallActive:
        audio.callState !== CALL_STATE.IDLE &&
        audio.callState !== CALL_STATE.DISCONNECTED &&
        audio.callState !== CALL_STATE.FAILED,
      isConnected: audio.callState === CALL_STATE.CONNECTED,
      isIncoming: audio.callState === CALL_STATE.INCOMING,
      isOutgoing: audio.callState === CALL_STATE.OUTGOING,
    }),
    [
      activeCallSession,
      session,
      callUiMinimized,
      audio.callState,
      audio.durationSec,
      audio.isMuted,
      audio.speakerOn,
      startCallForChat,
      acceptIncomingCall,
      declineIncomingCall,
      endActiveCall,
      minimizeCallUi,
      expandCallUi,
      returnToCallChat,
      registerNavigateToConversation,
      audio.toggleMute,
      audio.toggleSpeaker,
    ],
  );

  return (
    <CallContext.Provider value={value}>
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}
