import { useCallback, useEffect, useRef, useState } from "react";
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
    callIdRef.current = null;
    pendingOfferRef.current = null;
    if (activeCallIdRef) activeCallIdRef.current = null;
    setDurationSec(0);
    setIsMuted(false);
  }, [remoteAudioRef, activeCallIdRef]);

  const teardown = useCallback(
    (nextState = CALL_STATE.IDLE) => {
      cleanupMedia();
      setCallState(nextState);
    },
    [cleanupMedia],
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
    const pc = new RTCPeerConnection({ iceServers: getDefaultIceServers() });
    pc.onicecandidate = (ev) => {
      const callId = callIdRef.current;
      const remoteUserId = sessionRef.current?.remoteUserId;
      if (!callId || !ev.candidate || !remoteUserId) return;
      sendSignal(CALL_SIGNAL.ICE, remoteUserId, {
        call_id: callId,
        candidate: ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate,
      });
    };
    pc.ontrack = (ev) => {
      const stream = ev.streams?.[0] || new MediaStream([ev.track]);
      if (remoteAudioRef?.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch(() => {});
      }
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") {
        setCallState(CALL_STATE.CONNECTED);
        if (!durationTimerRef.current) {
          durationTimerRef.current = setInterval(() => {
            setDurationSec((s) => s + 1);
          }, 1000);
        }
      } else if (state === "failed") {
        teardown(CALL_STATE.FAILED);
        onCallEnded?.();
      } else if (state === "disconnected" || state === "closed") {
        teardown(CALL_STATE.DISCONNECTED);
        onCallEnded?.();
      }
    };
    pcRef.current = pc;
    return pc;
  }, [remoteAudioRef, sendSignal, teardown, onCallEnded]);

  const attachLocalAudio = useCallback(async (pc) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    return stream;
  }, []);

  const startCall = useCallback(async (overrideSession) => {
    const s = overrideSession || session;
    if (!s?.conversationId || !s?.remoteUserId) return false;
    try {
      await ensureHealthy();
      const callId = newCallId();
      callIdRef.current = callId;
      if (activeCallIdRef) activeCallIdRef.current = callId;
      setCallState(CALL_STATE.OUTGOING);
      const pc = createPeerConnection();
      await attachLocalAudio(pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(CALL_SIGNAL.OFFER, s.remoteUserId, {
        call_id: callId,
        conversation_id: s.conversationId,
        sdp: offer.sdp,
      });
      return true;
    } catch (err) {
      logCallSignal("startCall.failed", err?.message);
      teardown(CALL_STATE.FAILED);
      return false;
    }
  }, [
    session,
    ensureHealthy,
    createPeerConnection,
    attachLocalAudio,
    sendSignal,
    teardown,
    activeCallIdRef,
  ]);

  const acceptCall = useCallback(async () => {
    const callId = callIdRef.current;
    if (!callId || !session?.remoteUserId) return false;
    const pendingOffer =
      pendingOfferRef.current ||
      inboundQueueRef.current.find((f) => f.type === CALL_SIGNAL.OFFER && f.call_id === callId);
    if (!pendingOffer?.sdp) return false;
    try {
      setCallState(CALL_STATE.CONNECTING);
      const pc = createPeerConnection();
      await attachLocalAudio(pc);
      await pc.setRemoteDescription({ type: "offer", sdp: normalizeSdp(pendingOffer.sdp) });
      remoteDescSetRef.current = true;
      await flushIceQueue();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(CALL_SIGNAL.ANSWER, session.remoteUserId, {
        call_id: callId,
        sdp: answer.sdp,
      });
      return true;
    } catch (err) {
      logCallSignal("acceptCall.failed", err?.message);
      teardown(CALL_STATE.FAILED);
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
  ]);

  const declineCall = useCallback(
    (reason = "declined") => {
      const callId = callIdRef.current;
      if (callId && session?.remoteUserId) {
        sendSignal(CALL_SIGNAL.DECLINE, session.remoteUserId, { call_id: callId, reason });
      }
      teardown(CALL_STATE.IDLE);
      onCallEnded?.();
    },
    [session, sendSignal, teardown, onCallEnded],
  );

  const endCall = useCallback(
    (reason = "hangup") => {
      const callId = callIdRef.current;
      if (callId && session?.remoteUserId) {
        sendSignal(CALL_SIGNAL.END, session.remoteUserId, { call_id: callId, reason });
      }
      teardown(CALL_STATE.IDLE);
      onCallEnded?.();
    },
    [session, sendSignal, teardown, onCallEnded],
  );

  const toggleMute = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    const next = !tracks[0]?.enabled;
    tracks.forEach((t) => {
      t.enabled = !next;
    });
    setIsMuted(next);
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
        pendingOfferRef.current = frame;
        callIdRef.current = frame.call_id;
        if (activeCallIdRef) activeCallIdRef.current = frame.call_id;
        setCallState(CALL_STATE.INCOMING);
        return;
      }
      if (type === CALL_SIGNAL.RING) {
        setCallState(CALL_STATE.INCOMING);
        return;
      }
      if (type === CALL_SIGNAL.RINGING) {
        setCallState(CALL_STATE.OUTGOING);
        return;
      }
      if (type === CALL_SIGNAL.ANSWER) {
        const pc = pcRef.current;
        if (!pc || !frame.sdp) return;
        try {
          await pc.setRemoteDescription({ type: "answer", sdp: normalizeSdp(frame.sdp) });
          remoteDescSetRef.current = true;
          await flushIceQueue();
          setCallState(CALL_STATE.CONNECTING);
        } catch (err) {
          logCallSignal("answer.failed", err?.message);
          teardown(CALL_STATE.FAILED);
          onCallEnded?.();
        }
        return;
      }
      if (type === CALL_SIGNAL.ICE) {
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
        teardown(CALL_STATE.IDLE);
        onCallEnded?.();
        return;
      }
      if (type === CALL_SIGNAL.ERROR) {
        teardown(CALL_STATE.FAILED);
        onCallEnded?.();
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
    activeCallIdRef,
  ]);

  useEffect(() => () => cleanupMedia(), [cleanupMedia]);

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
    callIdRef,
  };
}
