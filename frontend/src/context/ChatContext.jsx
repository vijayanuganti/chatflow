import React, { useCallback, useContext, useMemo, useState } from "react";
import {
  clearStoredActiveConversationId,
  getStoredActiveConversationId,
  setStoredActiveConversationId,
} from "@/lib/activeConversationStorage";

const ChatContext = React.createContext(null);

export function ChatProvider({ children }) {
  const [activeConversationId, setActiveConversationIdState] = useState(
    () => getStoredActiveConversationId(),
  );
  /** Mobile: hide panel footer while chat input / emoji keyboard is open. */
  const [chatComposerActive, setChatComposerActive] = useState(false);

  const setActiveConversationId = useCallback((conversationId) => {
    const next = conversationId ? String(conversationId) : null;
    setActiveConversationIdState(next);
    setStoredActiveConversationId(next);
  }, []);

  const clearActiveConversation = useCallback(() => {
    setActiveConversationIdState(null);
    clearStoredActiveConversationId();
  }, []);

  const value = useMemo(
    () => ({
      activeConversationId,
      setActiveConversationId,
      clearActiveConversation,
      chatComposerActive,
      setChatComposerActive,
    }),
    [
      activeConversationId,
      setActiveConversationId,
      clearActiveConversation,
      chatComposerActive,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
