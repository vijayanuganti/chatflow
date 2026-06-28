import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useAuth } from "@/context/AuthContext";
import useChatSocket from "@/hooks/useChatSocket";

const ChatSocketContext = createContext(null);
const subscribersRef = { current: new Set() };

function broadcast(field, ...args) {
  subscribersRef.current.forEach((handlerRef) => {
    try {
      handlerRef.current?.[field]?.(...args);
    } catch {
      /* ignore subscriber errors */
    }
  });
}

export function ChatSocketProvider({ children }) {
  const { user } = useAuth();

  const socket = useChatSocket({
    enabled: Boolean(user?.id),
    onMessage: (msg) => broadcast("onMessage", msg),
    onTyping: (data) => broadcast("onTyping", data),
    onPresence: (data) => broadcast("onPresence", data),
    onReadReceipt: (data) => broadcast("onReadReceipt", data),
    onStatusUpdate: (data) => broadcast("onStatusUpdate", data),
    onMessageUpdated: (msg) => broadcast("onMessageUpdated", msg),
    onProfile: (u) => broadcast("onProfile", u),
    onConversationRemoved: (data) => broadcast("onConversationRemoved", data),
    onForceLogout: (data) => broadcast("onForceLogout", data),
  });

  const value = useMemo(
    () => ({
      connected: socket.connected,
      sendTyping: socket.sendTyping,
      sendSignal: socket.sendSignal,
      ensureHealthy: socket.ensureHealthy,
      reconnect: socket.reconnect,
    }),
    [socket.connected, socket.sendTyping, socket.sendSignal, socket.ensureHealthy, socket.reconnect],
  );

  return <ChatSocketContext.Provider value={value}>{children}</ChatSocketContext.Provider>;
}

export function useChatSocketContext() {
  const ctx = useContext(ChatSocketContext);
  if (!ctx) throw new Error("useChatSocketContext must be used within ChatSocketProvider");
  return ctx;
}

/** Register chat WS event handlers (merged with other subscribers). */
export function useChatSocketHandlers(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useLayoutEffect(() => {
    subscribersRef.current.add(ref);
    return () => {
      subscribersRef.current.delete(ref);
    };
  }, []);
}

export function useChatSocketTyping() {
  const { sendTyping } = useChatSocketContext();
  return useCallback(
    (conversationId, isTyping) => {
      sendTyping(conversationId, isTyping);
    },
    [sendTyping],
  );
}
