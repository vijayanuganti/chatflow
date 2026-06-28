import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useCall } from "@/context/CallContext";
import { useChat } from "@/context/ChatContext";
import { CALL_STATE } from "@/lib/callConstants";

/** Auto-minimize overlay when navigating away from the active call thread. */
export default function useCallBackgroundRoute() {
  const location = useLocation();
  const { activeConversationId } = useChat();
  const { activeCallSession, callState, minimizeCallUi, expandCallUi } = useCall();

  useEffect(() => {
    if (callState !== CALL_STATE.CONNECTED || !activeCallSession?.conversationId) return;
    const onCallThread =
      activeConversationId &&
      String(activeConversationId) === String(activeCallSession.conversationId);
    if (onCallThread) {
      expandCallUi();
    } else {
      minimizeCallUi();
    }
  }, [
    location.pathname,
    location.search,
    activeConversationId,
    activeCallSession?.conversationId,
    callState,
    minimizeCallUi,
    expandCallUi,
  ]);
}

export function GlobalCallBackground() {
  useCallBackgroundRoute();
  return null;
}
