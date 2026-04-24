import { useEffect, useRef, useState, useCallback } from "react";
import { getWsUrl } from "@/lib/api";

export default function useChatSocket({ onMessage, onTyping, onPresence, onReadReceipt, onProfile }) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const closedIntentionallyRef = useRef(false);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    const url = getWsUrl();
    if (!url) return;
    closedIntentionallyRef.current = false;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      if (closedIntentionallyRef.current) return;
      clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(connect, 2000);
    };
    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "message" && onMessage) onMessage(data.message);
        else if (data.type === "typing" && onTyping) onTyping(data);
        else if (data.type === "presence" && onPresence) onPresence(data);
        else if (data.type === "read_receipt" && onReadReceipt) onReadReceipt(data);
        else if (data.type === "profile" && onProfile) onProfile(data.user);
      } catch { /* ignore */ }
    };
  }, [onMessage, onTyping, onPresence, onReadReceipt, onProfile]);

  useEffect(() => {
    connect();
    return () => {
      closedIntentionallyRef.current = true;
      clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        try { wsRef.current.close(); } catch { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
