import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { CALL_STATE, CALL_SIGNAL } from "@/lib/callConstants";
import { callSignalListenerRef } from "@/lib/callSignalBridge";
import { logCallSignal } from "@/lib/callSignalingLog";
import { useChatSocketContext } from "@/context/ChatSocketContext";
import useAudioCall from "@/hooks/useAudioCall";
import { useAudioOutputRouting, OUTPUT_MODE } from "@/hooks/useAudioOutputRouting";
import { useRingtone } from "@/hooks/useRingtone";
import { useCallQuality } from "@/hooks/useCallQuality";
import { playRingbackBurst, RINGBACK_CYCLE_MS, RINGBACK_CTX_CLOSE_MS, safeCloseAudioContext } from "@/lib/ringtones";
import CallRatingSheet from "@/components/call/CallRatingSheet";
import { api, formatApiError } from "@/lib/api";

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const { sendSignal, ensureHealthy, reconnect } = useChatSocketContext();
  const remoteAudioRef = useRef(null);
  const navigateToConversationRef = useRef(null);
  const activeCallIdRef = useRef(null);
  const callThreadRefreshRef = useRef(null);
  const activeCallSessionRef = useRef(null);
  const inboundQueueRef = useRef([]);
  const remindMeTimeoutRef = useRef(null);
  const callStateRef = useRef(CALL_STATE.IDLE);
  const prevCallStateRef = useRef(CALL_STATE.IDLE);
  const durationWarnedRef = useRef(false);
  const durationWarnIntervalRef = useRef(null);
  const ratedCallIdsRef = useRef(new Set());
  const lastConnectedCallIdRef = useRef(null);
  /** Survives useAudioCall teardown (which clears activeCallIdRef before onCallEnded). */
  const persistedCallIdRef = useRef(null);
  const composerPrefillRef = useRef(null);
  const callEndHandledRef = useRef(false);
  const localHangupInitiatedRef = useRef(false);
  const endedCallIdsRef = useRef(new Set());
  const serverConfirmedCallIdsRef = useRef(new Set());
  const lastCallEndedAtRef = useRef(0);

  const [activeCallSession, setActiveCallSession] = useState(null);
  const [session, setSession] = useState(null);
  const [callUiMinimized, setCallUiMinimized] = useState(false);
  const [inboundSignalTick, setInboundSignalTick] = useState(0);
  const [overlayExiting, setOverlayExiting] = useState(false);
  const [ratingSheetOpen, setRatingSheetOpen] = useState(false);
  const [ratingCallId, setRatingCallId] = useState(null);
  const [rtcConnectionState, setRtcConnectionState] = useState("");
  const [composerPrefillTick, setComposerPrefillTick] = useState(0);

  activeCallSessionRef.current = activeCallSession;

  const {
    settings: ringtoneSettings,
    updateSettings: updateRingtone,
    previewTone,
    startRingtone,
    stopRingtone,
  } = useRingtone();

  const audioOutput = useAudioOutputRouting(remoteAudioRef);
  const { routeTo, OUTPUT_MODE: OutMode } = audioOutput;

  const clearRemindTimer = useCallback(() => {
    if (remindMeTimeoutRef.current) {
      clearTimeout(remindMeTimeoutRef.current);
      remindMeTimeoutRef.current = null;
    }
  }, []);

  const clearDurationWarning = useCallback(() => {
    durationWarnedRef.current = false;
    if (durationWarnIntervalRef.current) {
      clearInterval(durationWarnIntervalRef.current);
      durationWarnIntervalRef.current = null;
    }
  }, []);

  const clearCallSession = useCallback(() => {
    clearRemindTimer();
    clearDurationWarning();
    stopRingtone();
    setActiveCallSession(null);
    setSession(null);
    setCallUiMinimized(false);
    setOverlayExiting(false);
    setRtcConnectionState("");
    inboundQueueRef.current = [];
    setInboundSignalTick(0);
    activeCallIdRef.current = null;
    composerPrefillRef.current = null;
    void routeTo(OUTPUT_MODE.EARPIECE);
  }, [clearRemindTimer, clearDurationWarning, stopRingtone, routeTo]);

  const onCallError = useCallback((reason) => {
    const messages = {
      forbidden: "You can't place a call in this conversation.",
      invalid_offer: "Could not start the call. Please try again.",
    };
    toast.error(messages[reason] || "Call could not be connected.");
  }, []);

  const audioTeardownRef = useRef(() => {});
  const audioPrepareRef = useRef(() => {});

  const forceIdleCallState = useCallback(() => {
    audioPrepareRef.current();
  }, []);

  const onCallEnded = useCallback(
    (endedCallId = null) => {
      const currentCallId =
        activeCallIdRef.current ||
        activeCallSessionRef.current?.callId ||
        persistedCallIdRef.current;

      if (
        endedCallId &&
        currentCallId &&
        endedCallId !== currentCallId &&
        callStateRef.current !== CALL_STATE.IDLE
      ) {
        logCallSignal("session.ignore.onCallEnded.stale", endedCallId);
        return;
      }

      if (callEndHandledRef.current) return;
      callEndHandledRef.current = true;
      window.setTimeout(() => {
        callEndHandledRef.current = false;
      }, 800);

      const callId =
        endedCallId ||
        activeCallSessionRef.current?.callId ||
        persistedCallIdRef.current;
      const convId = activeCallSessionRef.current?.conversationId;

      if (callId) {
        endedCallIdsRef.current.add(callId);
      }

      const shouldSync = Boolean(callId) && serverConfirmedCallIdsRef.current.has(callId);
      if (callId) {
        serverConfirmedCallIdsRef.current.delete(callId);
      }

      localHangupInitiatedRef.current = false;
      lastCallEndedAtRef.current = Date.now();

      forceIdleCallState();
      clearCallSession();

      const refreshThread = (message) => {
        const refreshConvId = message?.conversation_id || convId;
        if (refreshConvId && callThreadRefreshRef.current) {
          callThreadRefreshRef.current(refreshConvId, message || null);
        }
      };

      if (shouldSync) {
        void api
          .post("/call-history/sync-thread-message", { call_id: callId })
          .then((res) => refreshThread(res.data?.message))
          .catch(() => {
            if (convId) window.setTimeout(() => refreshThread(null), 800);
          })
          .finally(() => {
            persistedCallIdRef.current = null;
          });
      } else {
        persistedCallIdRef.current = null;
        if (convId) window.setTimeout(() => refreshThread(null), 800);
      }
    },
    [clearCallSession, forceIdleCallState],
  );

  const onCallIdReady = useCallback((callId) => {
    if (!callId) return;
    persistedCallIdRef.current = callId;
    setActiveCallSession((prev) => (prev ? { ...prev, callId } : prev));
  }, []);

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
    onCallIdReady,
  });

  audioTeardownRef.current = audio.teardown;
  audioPrepareRef.current = audio.prepareForNewCall;

  const callQuality = useCallQuality(audio.peerConnectionRef);

  callStateRef.current = audio.callState;

  if (audio.callIdRef?.current) {
    persistedCallIdRef.current = audio.callIdRef.current;
  }

  useEffect(() => {
    if (
      audio.callState === CALL_STATE.IDLE ||
      audio.callState === CALL_STATE.DISCONNECTED ||
      audio.callState === CALL_STATE.FAILED
    ) {
      setOverlayExiting(false);
    }
  }, [audio.callState]);

  /** After hangup WebRTC may briefly set DISCONNECTED — always settle back to IDLE. */
  useEffect(() => {
    if (
      audio.callState === CALL_STATE.DISCONNECTED ||
      audio.callState === CALL_STATE.FAILED
    ) {
      forceIdleCallState();
    }
  }, [audio.callState, forceIdleCallState]);

  useEffect(() => {
    if (audio.callState === CALL_STATE.INCOMING) {
      void startRingtone(activeCallSession?.remoteUserId);
    } else {
      stopRingtone();
    }
  }, [audio.callState, activeCallSession?.remoteUserId, startRingtone, stopRingtone]);

  useEffect(() => {
    let ringbackInterval = null;
    const ctxList = [];
    const closeTimeouts = [];

    if (audio.callState === CALL_STATE.OUTGOING) {
      const playRingback = () => {
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return;
          const ctx = new Ctx();
          ctxList.push(ctx);
          playRingbackBurst(ctx, 0.25);
          const timeoutId = window.setTimeout(() => {
            safeCloseAudioContext(ctx);
            const idx = ctxList.indexOf(ctx);
            if (idx >= 0) ctxList.splice(idx, 1);
            const tIdx = closeTimeouts.indexOf(timeoutId);
            if (tIdx >= 0) closeTimeouts.splice(tIdx, 1);
          }, RINGBACK_CTX_CLOSE_MS);
          closeTimeouts.push(timeoutId);
        } catch {
          /* ignore */
        }
      };

      playRingback();
      ringbackInterval = setInterval(playRingback, RINGBACK_CYCLE_MS);
    }

    return () => {
      if (ringbackInterval) clearInterval(ringbackInterval);
      closeTimeouts.forEach((id) => clearTimeout(id));
      ctxList.forEach((ctx) => safeCloseAudioContext(ctx));
    };
  }, [audio.callState]);

  useEffect(() => {
    const remoteUserId = activeCallSession?.remoteUserId;
    if (!remoteUserId || activeCallSession?.remoteAvatarUrl) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get(`/users/${remoteUserId}/public`);
        const url = res.data?.avatar_url;
        if (cancelled || !url) return;
        setActiveCallSession((prev) =>
          prev?.remoteUserId === remoteUserId ? { ...prev, remoteAvatarUrl: url } : prev,
        );
      } catch {
        /* no avatar or access denied — keep initials */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCallSession?.remoteUserId, activeCallSession?.remoteAvatarUrl]);

  useEffect(() => {
    const pc = audio.peerConnectionRef?.current;
    if (!pc) {
      setRtcConnectionState("");
      return undefined;
    }
    const update = () => setRtcConnectionState(pc.connectionState || "");
    update();
    pc.addEventListener("connectionstatechange", update);
    return () => pc.removeEventListener("connectionstatechange", update);
  }, [audio.callState, audio.peerConnectionRef]);

  useEffect(() => {
    if (audio.callState === CALL_STATE.CONNECTED) {
      const id = activeCallSession?.callId || audio.callIdRef?.current;
      if (id) {
        lastConnectedCallIdRef.current = id;
        serverConfirmedCallIdsRef.current.add(id);
      }
    }
  }, [audio.callState, activeCallSession?.callId, audio.callIdRef]);

  useEffect(() => {
    const prev = prevCallStateRef.current;
    prevCallStateRef.current = audio.callState;

    if (prev === CALL_STATE.CONNECTED && audio.callState === CALL_STATE.DISCONNECTED) {
      const callId = lastConnectedCallIdRef.current;
      if (callId && !ratedCallIdsRef.current.has(callId)) {
        ratedCallIdsRef.current.add(callId);
        setRatingCallId(callId);
        setRatingSheetOpen(true);
      }
    }
  }, [audio.callState]);

  useEffect(() => {
    if (audio.callState !== CALL_STATE.CONNECTED) {
      clearDurationWarning();
      return undefined;
    }
    durationWarnIntervalRef.current = setInterval(() => {
      if (durationWarnedRef.current) return;
      if (audio.durationSec >= 30 * 60) {
        durationWarnedRef.current = true;
        toast.message("Call has been going for 30 min", { duration: 4000 });
      }
    }, 5000);
    return () => clearDurationWarning();
  }, [audio.callState, audio.durationSec, clearDurationWarning]);

  const onCallSignalReceived = useCallback((frame) => {
    const type = frame?.type;
    const callId = frame?.call_id;
    const activeCallId = activeCallIdRef.current;

    if (callId && endedCallIdsRef.current.has(callId)) {
      logCallSignal("session.ignore.ended", type);
      return;
    }

    if (
      callId &&
      activeCallId &&
      callId !== activeCallId &&
      (type === CALL_SIGNAL.DECLINE ||
        type === CALL_SIGNAL.END ||
        type === CALL_SIGNAL.ENDED ||
        type === CALL_SIGNAL.ANSWER ||
        type === CALL_SIGNAL.ICE)
    ) {
      logCallSignal("session.ignore.other_call", type);
      return;
    }

    const idle = callStateRef.current === CALL_STATE.IDLE;
    if (
      idle &&
      type !== CALL_SIGNAL.OFFER &&
      type !== CALL_SIGNAL.RING &&
      type !== CALL_SIGNAL.RINGING
    ) {
      logCallSignal("session.ignore.stale", type);
      return;
    }

    inboundQueueRef.current.push(frame);
    logCallSignal("session.queue", frame?.type);

    if (frame?.call_id) {
      persistedCallIdRef.current = frame.call_id;
    }

    if (frame?.type === CALL_SIGNAL.RINGING && frame?.call_id) {
      serverConfirmedCallIdsRef.current.add(frame.call_id);
    }

    if (frame?.type === "call-offer") {
      endedCallIdsRef.current.delete(frame.call_id);
      serverConfirmedCallIdsRef.current.add(frame.call_id);
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

  const registerCallThreadRefresh = useCallback((fn) => {
    callThreadRefreshRef.current = fn;
  }, []);

  const consumeComposerPrefill = useCallback((conversationId) => {
    const pending = composerPrefillRef.current;
    if (!pending || String(pending.conversationId) !== String(conversationId)) return null;
    composerPrefillRef.current = null;
    return pending.text;
  }, []);

  const startCallForChat = useCallback(
    async (conversationId, remoteUserId, remoteName, remoteAvatarUrl = null) => {
      if (audio.callState === CALL_STATE.INCOMING) return false;

      if (
        audio.callState !== CALL_STATE.IDLE &&
        audio.callState !== CALL_STATE.DISCONNECTED &&
        audio.callState !== CALL_STATE.FAILED
      ) {
        logCallSignal("startCall.reset.stuck", audio.callState);
        forceIdleCallState();
        clearCallSession();
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      callEndHandledRef.current = false;
      localHangupInitiatedRef.current = false;
      inboundQueueRef.current = [];
      setInboundSignalTick(0);
      if (endedCallIdsRef.current.size > 48) {
        endedCallIdsRef.current = new Set(Array.from(endedCallIdsRef.current).slice(-24));
      }

      try {
        if (Date.now() - lastCallEndedAtRef.current < 20_000) {
          reconnect();
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
        await ensureHealthy();
      } catch {
        toast.error("Connection lost. Check your network and try again.");
        return false;
      }

      const nextSession = { conversationId, remoteUserId, remoteName };
      setSession(nextSession);
      setActiveCallSession({
        callId: null,
        conversationId,
        remoteUserId,
        remoteName,
        remoteAvatarUrl: remoteAvatarUrl || null,
        direction: "outgoing",
      });
      setCallUiMinimized(false);

      const result = await audio.startCall(nextSession);
      const ok = result?.ok === true;
      if (ok && audio.callIdRef?.current) {
        persistedCallIdRef.current = audio.callIdRef.current;
        setActiveCallSession((prev) =>
          prev ? { ...prev, callId: audio.callIdRef.current } : prev,
        );
      }
      if (!ok) {
        forceIdleCallState();
        clearCallSession();
        const messages = {
          mic_denied: "Microphone access is required for calls. Allow mic permission in browser settings.",
          mic_busy: "Microphone is still in use. Wait a moment and try again.",
          network: "Connection lost. Check your network and try again.",
          missing_session: "Could not start the call. Please try again.",
        };
        toast.error(messages[result?.error] || "Could not start the call. Please try again.");
      }
      return ok;
    },
    [audio, clearCallSession, forceIdleCallState, ensureHealthy, reconnect],
  );

  const acceptIncomingCall = useCallback(async () => {
    clearRemindTimer();
    setCallUiMinimized(false);
    const ok = await audio.acceptCall();
    if (ok && activeCallSession?.conversationId) {
      navigateToConversationRef.current?.(activeCallSession.conversationId);
    }
    return ok;
  }, [audio, activeCallSession, clearRemindTimer]);

  const declineIncomingCall = useCallback(() => {
    clearRemindTimer();
    localHangupInitiatedRef.current = true;
    audio.declineCall("declined");
  }, [audio, clearRemindTimer]);

  const endActiveCall = useCallback(
    (reason = "hangup") => {
      clearRemindTimer();
      setOverlayExiting(true);
      localHangupInitiatedRef.current = true;
      const endingId =
        activeCallSessionRef.current?.callId ||
        audio.callIdRef?.current ||
        persistedCallIdRef.current;
      if (endingId) endedCallIdsRef.current.add(endingId);
      audio.endCall(reason);
      void ensureHealthy().catch(() => {});
    },
    [audio, clearRemindTimer, ensureHealthy],
  );

  const minimizeCallUi = useCallback(() => setCallUiMinimized(true), []);
  const expandCallUi = useCallback(() => setCallUiMinimized(false), []);

  const openCallChatWithNote = useCallback(() => {
    const convId = activeCallSession?.conversationId;
    if (!convId) return;
    composerPrefillRef.current = { conversationId: convId, text: "[Call note] " };
    setComposerPrefillTick((t) => t + 1);
    setCallUiMinimized(true);
    navigateToConversationRef.current?.(convId);
  }, [activeCallSession?.conversationId]);

  const returnToCallChat = useCallback(() => {
    if (activeCallSession?.conversationId) {
      navigateToConversationRef.current?.(activeCallSession.conversationId);
    }
    setCallUiMinimized(true);
  }, [activeCallSession]);

  const remindMeLater = useCallback(() => {
    const callId = activeCallSession?.callId;
    clearRemindTimer();
    minimizeCallUi();
    remindMeTimeoutRef.current = setTimeout(() => {
      remindMeTimeoutRef.current = null;
      if (
        callStateRef.current === CALL_STATE.INCOMING &&
        activeCallSessionRef.current?.callId === callId
      ) {
        expandCallUi();
      }
    }, 60_000);
  }, [activeCallSession?.callId, clearRemindTimer, minimizeCallUi, expandCallUi]);

  const sendQuickReplyAndDecline = useCallback(
    async (message, { autoSend = true } = {}) => {
      const convId = activeCallSession?.conversationId;
      if (!convId) return;
      clearRemindTimer();
      endActiveCall("busy");
      navigateToConversationRef.current?.(convId);
      if (!message) return;
      if (!autoSend) return;
      try {
        await api.post("/messages", {
          conversation_id: convId,
          content: message,
          message_type: "text",
        });
      } catch (err) {
        toast.error(formatApiError(err));
      }
    },
    [activeCallSession?.conversationId, clearRemindTimer, endActiveCall],
  );

  const dismissRatingSheet = useCallback(() => {
    setRatingSheetOpen(false);
    setRatingCallId(null);
  }, []);

  const value = useMemo(
    () => ({
      activeCallSession,
      session,
      callUiMinimized,
      overlayExiting,
      callState: audio.callState,
      durationSec: audio.durationSec,
      isMuted: audio.isMuted,
      speakerOn: audio.speakerOn,
      outputMode: audioOutput.outputMode,
      routeTo: audioOutput.routeTo,
      OUTPUT_MODE: OutMode,
      peerConnectionRef: audio.peerConnectionRef,
      rtcConnectionState,
      callQuality,
      ringtoneSettings,
      updateRingtone,
      previewTone,
      startCallForChat,
      acceptIncomingCall,
      declineIncomingCall,
      endActiveCall,
      minimizeCallUi,
      expandCallUi,
      returnToCallChat,
      openCallChatWithNote,
      consumeComposerPrefill,
      composerPrefillTick,
      remindMeLater,
      sendQuickReplyAndDecline,
      registerNavigateToConversation,
      registerCallThreadRefresh,
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
      overlayExiting,
      audio.callState,
      audio.durationSec,
      audio.isMuted,
      audio.speakerOn,
      audio.peerConnectionRef,
      audioOutput.outputMode,
      audioOutput.routeTo,
      OutMode,
      rtcConnectionState,
      callQuality,
      ringtoneSettings,
      updateRingtone,
      previewTone,
      startCallForChat,
      acceptIncomingCall,
      declineIncomingCall,
      endActiveCall,
      minimizeCallUi,
      expandCallUi,
      returnToCallChat,
      openCallChatWithNote,
      consumeComposerPrefill,
      composerPrefillTick,
      remindMeLater,
      sendQuickReplyAndDecline,
      registerNavigateToConversation,
      registerCallThreadRefresh,
      audio.toggleMute,
      audio.toggleSpeaker,
    ],
  );

  return (
    <CallContext.Provider value={value}>
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />
      <CallRatingSheet callId={ratingCallId} open={ratingSheetOpen} onDismiss={dismissRatingSheet} />
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
}
