import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useChat } from "@/context/ChatContext";
import { getStoredActiveConversationId } from "@/lib/activeConversationStorage";

/**
 * Back navigation that restores the active chat from sessionStorage before history moves.
 */
export function useNavigateBack({ backTo, pendingChat, replaceState } = {}) {
  const navigate = useNavigate();
  const { setActiveConversationId } = useChat();

  return useCallback(() => {
    const convId =
      pendingChat?.selectedConv?.id || getStoredActiveConversationId();
    if (convId) setActiveConversationId(convId);

    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }

    if (pendingChat?.selectedConv?.id && backTo) {
      navigate(backTo, {
        replace: true,
        state: { pendingChat, ...(replaceState || {}) },
      });
      return;
    }

    if (backTo) navigate(backTo, { replace: true, state: replaceState });
  }, [navigate, backTo, pendingChat, replaceState, setActiveConversationId]);
}
