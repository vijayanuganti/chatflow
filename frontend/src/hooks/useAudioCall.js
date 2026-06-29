import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  CALL_STATE,
  CALL_SIGNAL,
  getDefaultIceServers,
  normalizeSdp,
  newCallId,
} from "@/lib/callConstants";
import { logCallSignal } from "@/lib/callSignalingLog";

function parseIceCandidate(candidate) {
  if (!candidate) return null;
  if (typeof candidate === "object" && candidate.candidate) return candidate;
  if (typeof candidate === "string") {
    return { candidate, sdpMid: "0", sdpMLineIndex: 0 };
  }
  return candidate;
}

export default function useAudioCall({
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
}) {
  const [callState, setCallState] = useState(CALL_STATE.IDLE);
  const [durationSec, setDurationSec] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const iceQueueRef = useRef([]);
  const remoteDescSetRef = useRef(false);
  const durationTimerRef = useRef(null);
  const callIdRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const endingCallRef = useRef(false);
  const teardownCalledRef = useRef(false);
  const callGenerationRef = useRef(0);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const cleanupMedia = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        /* ignore */
      }
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef?.current) {
      remoteAudioRef.current.srcObject = null;
    }
    iceQueueRef.current = [];
    remoteDescSetRef.current = false;
    pendingOfferRef.current = null;
    setDurationSec(0);
    setIsMuted(false);
  }, [remoteAudioRef]);

  const teardown = useCallback(() => {
    if (teardownCalledRef.current) return;
    teardownCalledRef.current = true;
    endingCallRef.current = true;

    cleanupMedia();
    callIdRef.current = null;
    if (activeCallIdRef) activeCallIdRef.current = null;
    setCallState(CALL_STATE.IDLE);
    logCallSignal("teardown.idle", null);

    window.setTimeout(() => {
      endingCallRef.current = false;
    }, 500);
  }, [cleanupMedia, activeCallIdRef]);

  const bindPeerConnectionHandlers = useCallback(
    (pc, generation) => {
      pc.onicecandidate = (ev) => {
        if (generation !== callGenerationRef.current) return;
        const callId = callIdRef.current;
        const remoteUserId = sessionRef.current?.remoteUserId;
        if (!callId || !ev.candidate || !remoteUserId) return;
        sendSignal(CALL_SIGNAL.ICE, remoteUserId, {
          call_id: callId,
          candidate: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate,
        });
      };
      pc.ontrack = (ev) => {
        if (generation !== callGenerationRef.current) return;
        const stream = ev.streams?.[0] || new MediaStream([ev.track]);
        if (remoteAudioRef?.current) {
          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current.play().catch(() => {});
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc !== pcRef.current) return;
        if (generation !== callGenerationRef.current) return;
        const state = pc.connectionState;
        if (state === "connected") {
          setCallState(CALL_STATE.CONNECTED);
          if (!durationTimerRef.current) {
            durationTimerRef.current = setInterval(() => {
              setDurationSec((s) => s + 1);
            }, 1000);
          }
        } else if (state === "failed") {
          if (endingCallRef.current) return;
          const endedId = callIdRef.current;
          teardown();
          onCallEnded?.(endedId);
        } else if (state === "disconnected" || state === "closed") {
          if (endingCallRef.current) return;
          const endedId = callIdRef.current;
          teardown();
          onCallEnded?.(endedId);
        }
      };
    },
    [remoteAudioRef, sendSignal, teardown, onCallEnded],
  );

  const flushIceQueue = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !remoteDescSetRef.current) return;
    while (iceQueueRef.current.length) {
      const cand = iceQueueRef.current.shift();
      try {
        await pc.addIceCandidate(cand);
      } catch (err) {
        logCallSignal("ice.add.failed", err?.message);
      }
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        /* ignore */
      }
      pcRef.current = null;
    }

    const pc = new RTCPeerConnection({ iceServers: getDefaultIceServers() });
    const generation = callGenerationRef.current;
    bindPeerConnectionHandlers(pc, generation);
    pcRef.current = pc;
    return pc;
  }, [bindPeerConnectionHandlers]);

  const attachLocalAudio = useCallback(async (pc) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    return stream;
  }, []);

  const prepareForNewCall = useCallback(() => {
    callGenerationRef.current += 1;
    teardownCalledRef.current = false;
    endingCallRef.current = false;
    cleanupMedia();
    callIdRef.current = null;
    if (activeCallIdRef) activeCallIdRef.current = null;
    setCallState(CALL_STATE.IDLE);
  }, [cleanupMedia, activeCallIdRef]);

  const startCall = useCallback(async (overrideSession) => {
    const s = overrideSession || sessionRef.current;
    if (!s?.conversationId || !s?.remoteUserId) {
      return { ok: false, error: "missing_session" };
    }
    try {
      prepareForNewCall();
      const micReleaseMs = Capacitor.isNativePlatform() ? 350 : 120;
      await new Promise((resolve) => setTimeout(resolve, micReleaseMs));

      await ensureHealthy();
      const callId = newCallId();
      callIdRef.current = callId;
      if (activeCallIdRef) activeCallIdRef.current = callId;
      onCallIdReady?.(callId);
      sessionRef.current = s;
      setCallState(CALL_STATE.OUTGOING);
      const pc = createPeerConnection();
      await attachLocalAudio(pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sent = sendSignal(CALL_SIGNAL.OFFER, s.remoteUserId, {
        call_id: callId,
        conversation_id: s.conversationId,
        sdp: offer.sdp,
      });
      if (!sent) {
        throw new Error("WebSocket not open");
      }
      return { ok: true, callId };
    } catch (err) {
      logCallSignal("startCall.failed", err?.message);
      teardown();
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        return { ok: false, error: "mic_denied" };
      }
      if (name === "NotReadableError" || name === "AbortError") {
        return { ok: false, error: "mic_busy" };
      }
      if (String(err?.message || "").includes("WebSocket")) {
        return { ok: false, error: "network" };
      }
      return { ok: false, error: "unknown" };
    }
  }, [
    ensureHealthy,
    createPeerConnection,
    attachLocalAudio,
    sendSignal,
    teardown,
    cleanupMedia,
    activeCallIdRef,
    prepareForNewCall,
    onCallIdReady,
  ]);

  const acceptCall = useCallback(async () => {
    const callId = callIdRef.current;
    if (!callId || !session?.remoteUserId) return false;
    const pendingOffer =
      pendingOfferRef.current ||
      inboundQueueRef.current.find((f) => f.type === CALL_SIGNAL.OFFER && f.call_id === callId);
    if (!pendingOffer?.sdp) return false;
    try {
      teardownCalledRef.current = false;
      if (pcRef.current) {
        try {
          pcRef.current.ontrack = null;
          pcRef.current.onicecandidate = null;
          pcRef.current.onconnectionstatechange = null;
          pcRef.current.close();
        } catch {
          /* ignore */
        }
        pcRef.current = null;
      }
      iceQueueRef.current = [];
      remoteDescSetRef.current = false;

      setCallState(CALL_STATE.CONNECTING);
      const pc = createPeerConnection();
      await attachLocalAudio(pc);
      await pc.setRemoteDescription({ type: "offer", sdp: normalizeSdp(pendingOffer.sdp) });
      remoteDescSetRef.current = true;
      await flushIceQueue();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const sent = sendSignal(CALL_SIGNAL.ANSWER, session.remoteUserId, {
        call_id: callId,
        sdp: answer.sdp,
      });
      if (!sent) {
        throw new Error("WebSocket not open");
      }
      return true;
    } catch (err) {
      logCallSignal("acceptCall.failed", err?.message);
      const endedId = callIdRef.current;
      teardown();
      onCallEnded?.(endedId);
      return false;
    }
  }, [
    session,
    inboundQueueRef,
    createPeerConnection,
    attachLocalAudio,
    flushIceQueue,
    sendSignal,
    teardown,
    onCallEnded,
  ]);

  const declineCall = useCallback(
    (reason = "declined") => {
      const callId = callIdRef.current;
      const remoteUserId = sessionRef.current?.remoteUserId;
      if (callId && remoteUserId) {
        sendSignal(CALL_SIGNAL.DECLINE, remoteUserId, { call_id: callId, reason });
      }
      teardown();
      onCallEnded?.(callId);
    },
    [sendSignal, teardown, onCallEnded],
  );

  const endCall = useCallback(
    (reason = "hangup") => {
      const callId = callIdRef.current;
      const remoteUserId = sessionRef.current?.remoteUserId;
      if (callId && remoteUserId) {
        sendSignal(CALL_SIGNAL.END, remoteUserId, { call_id: callId, reason });
      }
      teardown();
      onCallEnded?.(callId);
    },
    [sendSignal, teardown, onCallEnded],
  );

  const toggleMute = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    setIsMuted((prev) => {
      const nextMuted = !prev;
      tracks.forEach((t) => {
        t.enabled = !nextMuted;
      });
      return nextMuted;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((v) => !v);
  }, []);

  useEffect(() => {
    if (!inboundSignalTick) return;
    const queue = inboundQueueRef.current || [];
    if (!queue.length) return;

    const processFrame = async (frame) => {
      const type = frame?.type;
      logCallSignal("session.inbound", type);

      if (type === CALL_SIGNAL.OFFER) {
        if (callIdRef.current && frame.call_id && frame.call_id !== callIdRef.current) {
          logCallSignal("session.ignore.offer.other", type);
          return;
        }
        pendingOfferRef.current = frame;
        callIdRef.current = frame.call_id;
        if (activeCallIdRef) activeCallIdRef.current = frame.call_id;
        setCallState(CALL_STATE.INCOMING);
        return;
      }
      if (type === CALL_SIGNAL.RING) {
        if (frame.call_id && callIdRef.current && frame.call_id !== callIdRef.current) {
          logCallSignal("session.ignore.ring.stale", type);
          return;
        }
        if (frame.call_id) {
          callIdRef.current = frame.call_id;
          if (activeCallIdRef) activeCallIdRef.current = frame.call_id;
        }
        setCallState(CALL_STATE.INCOMING);
        return;
      }
      if (type === CALL_SIGNAL.RINGING) {
        if (frame.call_id && callIdRef.current && frame.call_id !== callIdRef.current) {
          logCallSignal("session.ignore.ringing.stale", type);
          return;
        }
        setCallState(CALL_STATE.OUTGOING);
        return;
      }
      if (type === CALL_SIGNAL.ANSWER) {
        const pc = pcRef.current;
        if (!pc || !frame.sdp || callIdRef.current !== frame.call_id) return;
        try {
          await pc.setRemoteDescription({ type: "answer", sdp: normalizeSdp(frame.sdp) });
          remoteDescSetRef.current = true;
          await flushIceQueue();
          setCallState(CALL_STATE.CONNECTING);
        } catch (err) {
          logCallSignal("answer.failed", err?.message);
          const endedId = callIdRef.current;
          teardown();
          onCallEnded?.(endedId);
        }
        return;
      }
      if (type === CALL_SIGNAL.ICE) {
        if (frame.call_id && callIdRef.current && frame.call_id !== callIdRef.current) {
          logCallSignal("session.ignore.ice.stale", type);
          return;
        }
        const cand = parseIceCandidate(frame.candidate);
        if (!cand) return;
        if (!remoteDescSetRef.current || !pcRef.current) {
          iceQueueRef.current.push(cand);
          return;
        }
        try {
          await pcRef.current.addIceCandidate(cand);
        } catch (err) {
          logCallSignal("ice.remote.failed", err?.message);
        }
        return;
      }
      if (type === CALL_SIGNAL.DECLINE || type === CALL_SIGNAL.END || type === CALL_SIGNAL.ENDED) {
        if (!callIdRef.current || (frame.call_id && frame.call_id !== callIdRef.current)) {
          logCallSignal("session.ignore.end.stale", type);
          return;
        }
        const endedId = callIdRef.current;
        teardown();
        onCallEnded?.(endedId);
        return;
      }
      if (type === CALL_SIGNAL.ERROR) {
        const endedId = callIdRef.current;
        teardown();
        onCallError?.(frame.reason, frame.detail);
        onCallEnded?.(endedId);
      }
    };

    while (queue.length) {
      const frame = queue.shift();
      void processFrame(frame);
    }
  }, [
    inboundSignalTick,
    inboundQueueRef,
    flushIceQueue,
    teardown,
    onCallEnded,
    onCallError,
    activeCallIdRef,
  ]);

  useEffect(() => () => {
    teardownCalledRef.current = false;
    cleanupMedia();
    setCallState(CALL_STATE.IDLE);
  }, [cleanupMedia]);

  return {
    callState,
    durationSec,
    isMuted,
    speakerOn,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    teardown,
    prepareForNewCall,
    callIdRef,
    peerConnectionRef: pcRef,
  };
}
