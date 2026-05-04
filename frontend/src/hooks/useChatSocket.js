import { useEffect, useRef, useState, useCallback } from "react";
import { getWsUrl } from "@/lib/api";

export default function useChatSocket({
  onMessage,
  onTyping,
  onPresence,
  onReadReceipt,
  onProfile,
  enabled = true,
}) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const pingRef = useRef(null);
  const closedIntentionallyRef = useRef(false);
  const [connected, setConnected] = useState(false);

  const handlersRef = useRef({});
  handlersRef.current = { onMessage, onTyping, onPresence, onReadReceipt, onProfile };

  const connect = useCallback(() => {
    if (!enabled) return;
    const url = getWsUrl();
    if (!url) {
      if (!closedIntentionallyRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(connect, 3000);
      }
      return;
    }

    closedIntentionallyRef.current = false;

    if (wsRef.current) {
      try {
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(JSON.stringify({ type: "ping" }));
          } catch {
            /* ignore */
          }
        }
      }, 25000);
    };

    ws.onclose = () => {
      setConnected(false);
      clearInterval(pingRef.current);
      pingRef.current = null;
      if (closedIntentionallyRef.current) return;
      clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const { onMessage, onTyping, onPresence, onReadReceipt, onProfile } = handlersRef.current;
        if (data.type === "message" && onMessage) onMessage(data.message);
        else if (data.type === "typing" && onTyping) onTyping(data);
        else if (data.type === "presence" && onPresence) onPresence(data);
        else if (data.type === "read_receipt" && onReadReceipt) onReadReceipt(data);
        else if (data.type === "profile" && onProfile) onProfile(data.user);
      } catch {
        /* ignore */
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      closedIntentionallyRef.current = true;
      clearTimeout(reconnectRef.current);
      clearInterval(pingRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
      setConnected(false);
      return undefined;
    }

    connect();

    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (!getWsUrl()) return;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      closedIntentionallyRef.current = true;
      clearTimeout(reconnectRef.current);
      clearInterval(pingRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [enabled, connect]);

  const sendTyping = useCallback((conversationId, isTyping) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "typing",
        conversation_id: conversationId,
        is_typing: isTyping,
      }));
    }
  }, []);

  return { connected, sendTyping };
}
