import { useEffect, useRef, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { getWsUrl } from "@/lib/api";

export default function useChatSocket({
  onMessage,
  onTyping,
  onPresence,
  onReadReceipt,
  onStatusUpdate,
  onProfile,
  onConversationRemoved,
  enabled = true,
}) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const pingRef = useRef(null);
  const closedIntentionallyRef = useRef(false);
  const [connected, setConnected] = useState(false);

  const handlersRef = useRef({});
  handlersRef.current = {
    onMessage,
    onTyping,
    onPresence,
    onReadReceipt,
    onStatusUpdate,
    onProfile,
    onConversationRemoved,
  };

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
        const prev = wsRef.current;
        prev.onopen = null;
        prev.onmessage = null;
        prev.onerror = null;
        prev.onclose = null;
        if (prev.readyState === WebSocket.CONNECTING) {
          // React 18 Strict Mode (dev) runs effect cleanup while the first socket is
          // still handshaking. Synchronous close() spams "closed before connection is
          // established" — wait for open/error then close.
          prev.addEventListener("open", () => {
            try {
              prev.close(1000, "unmount");
            } catch {
              /* ignore */
            }
          }, { once: true });
          prev.addEventListener("error", () => {
            try {
              prev.close();
            } catch {
              /* ignore */
            }
          }, { once: true });
        } else {
          prev.close(1000, "unmount");
        }
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
        const {
          onMessage,
          onTyping,
          onPresence,
          onReadReceipt,
          onStatusUpdate,
          onProfile,
          onConversationRemoved,
        } = handlersRef.current;
        if (data.type === "message" && onMessage) onMessage(data.message);
        else if (data.type === "typing" && onTyping) onTyping(data);
        else if (data.type === "presence" && onPresence) onPresence(data);
        else if (data.type === "read_receipt" && onReadReceipt) onReadReceipt(data);
        else if (data.type === "STATUS_UPDATE" && onStatusUpdate) onStatusUpdate(data);
        else if (data.type === "profile" && onProfile) onProfile(data.user);
        else if (data.type === "conversation_removed" && onConversationRemoved) onConversationRemoved(data);
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
        const ws = wsRef.current;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          if (ws.readyState === WebSocket.CONNECTING) {
            ws.addEventListener("open", () => {
              try {
                ws.close(1000, "unmount");
              } catch {
                /* ignore */
              }
            }, { once: true });
            ws.addEventListener("error", () => {
              try {
                ws.close();
              } catch {
                /* ignore */
              }
            }, { once: true });
          } else {
            ws.close(1000, "unmount");
          }
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

    let appStateListener = null;
    if (Capacitor.isNativePlatform()) {
      import("@capacitor/app")
        .then(({ App }) => {
          appStateListener = App.addListener("appStateChange", ({ isActive }) => {
            if (isActive) {
              if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                connect();
              }
            } else {
              closedIntentionallyRef.current = true;
              clearTimeout(reconnectRef.current);
              clearInterval(pingRef.current);
              const ws = wsRef.current;
              wsRef.current = null;
              if (ws) {
                ws.onopen = null;
                ws.onmessage = null;
                ws.onerror = null;
                ws.onclose = null;
                try {
                  ws.close(1000, "background");
                } catch {
                  /* ignore */
                }
              }
              setConnected(false);
            }
          });
        })
        .catch(() => {});
    }

    return () => {
      if (appStateListener?.remove) {
        appStateListener.remove().catch(() => {});
      }
      document.removeEventListener("visibilitychange", onVis);
      closedIntentionallyRef.current = true;
      clearTimeout(reconnectRef.current);
      clearInterval(pingRef.current);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          if (ws.readyState === WebSocket.CONNECTING) {
            ws.addEventListener("open", () => {
              try {
                ws.close(1000, "unmount");
              } catch {
                /* ignore */
              }
            }, { once: true });
            ws.addEventListener("error", () => {
              try {
                ws.close();
              } catch {
                /* ignore */
              }
            }, { once: true });
          } else {
            ws.close(1000, "unmount");
          }
        } catch {
          /* ignore */
        }
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
