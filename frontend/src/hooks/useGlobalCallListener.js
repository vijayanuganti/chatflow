import { useEffect } from "react";
import { useCall } from "@/context/CallContext";
import { logCallSignal } from "@/lib/callSignalingLog";

/** Confirms call listener path is live for the signed-in session. */
export default function useGlobalCallListener(userId) {
  useEffect(() => {
    if (!userId) return;
    logCallSignal("listener.ready", userId);
  }, [userId]);
}

export function GlobalCallBridge() {
  const { registerNavigateToConversation } = useCall();
  useEffect(() => {
    registerNavigateToConversation(null);
  }, [registerNavigateToConversation]);
  return null;
}
