import { useEffect, useRef, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { getWsUrl } from "@/lib/api";
import { CALL_INBOUND_TYPES } from "@/lib/callConstants";
import { callSignalListenerRef } from "@/lib/callSignalBridge";
import { logCallSignal } from "@/lib/callSignalingLog";

/**
 * Single app-wide WebSocket hook. ChatSocketProvider owns one instance.
 * Call frames route synchronously to callSignalListenerRef.current.
 */
export default function useChatSocket({
  onMessage,
  onTyping,
  onPresence,
  onReadReceipt,
  onStatusUpdate,
  onMessageUpdated,
  onProfile,
  onConversationRemoved,
  onForceLogout,
  enabled = true,
}) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const pingRef = useRef(null);
  const closedIntentionallyRef = useRef(false);
  const healthWaiterRef = useRef(null);
  const [connected, setConnected] = useState(false);

  const handlersRef = useRef({});
  handlersRef.current = {
    onMessage,
    onTyping,
    onPresence,
    onReadReceipt,
    onStatusUpdate,
    onMessageUpdated,
    onProfile,
    onConversationRemoved,
    onForceLogout,
  };

  const dispatchChatEvent = useCallback((data) => {
    const {
      onMessage,
      onTyping,
      onPresence,
      onReadReceipt,
      onStatusUpdate,
      onMessageUpdated,
      onProfile,
      onConversationRemoved,
      onForceLogout,
    } = handlersRef.current;

    if (data.type === "message" && onMessage) onMessage(data.message);
    else if (data.type === "message_updated" && onMessageUpdated) onMessageUpdated(data.message);
    else if (data.type === "typing" && onTyping) onTyping(data);
    else if (data.type === "presence" && onPresence) onPresence(data);
    else if (data.type === "read_receipt" && onReadReceipt) onReadReceipt(data);
    else if ((data.type === "status_update" || data.type === "STATUS_UPDATE") && onStatusUpdate) {
      onStatusUpdate(data);
    } else if (data.type === "profile" && onProfile) onProfile(data.user);
    else if (data.type === "conversation_removed" && onConversationRemoved) {
      onConversationRemoved(data);
    } else if (data.type === "force_logout" && onForceLogout) onForceLogout(data);
  }, []);

  const handleWsMessage = useCallback((data) => {
    if (data?.type === "pong") {
      const waiter = healthWaiterRef.current;
      if (waiter) {
        healthWaiterRef.current = null;
        clearTimeout(waiter.timeoutId);
        waiter.resolve(true);
      }
      return;
    }

    if (CALL_INBOUND_TYPES.has(data?.type)) {
      logCallSignal("ws.inbound", data?.type);
      const listener = callSignalListenerRef.current;
      if (typeof listener === "function") {
        listener(data);
      }
      return;
    }

    dispatchChatEvent(data);
  }, [dispatchChatEvent]);

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
          prev.addEventListener(
            "open",
            () => {
              try {
                prev.close(1000, "reconnect");
              } catch {
                /* ignore */
              }
            },
            { once: true },
          );
          prev.addEventListener(
            "error",
            () => {
              try {
                prev.close();
              } catch {
                /* ignore */
              }
            },
            { once: true },
          );
        } else {
          prev.close(1000, "reconnect");
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
      const waiter = healthWaiterRef.current;
      if (waiter) {
        healthWaiterRef.current = null;
        clearTimeout(waiter.timeoutId);
        waiter.reject(new Error("WebSocket closed"));
      }
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
        handleWsMessage(data);
      } catch {
        /* ignore */
      }
    };
  }, [enabled, handleWsMessage]);

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
            ws.addEventListener(
              "open",
              () => {
                try {
                  ws.close(1000, "unmount");
                } catch {
                  /* ignore */
                }
              },
              { once: true },
            );
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
            ws.addEventListener(
              "open",
              () => {
                try {
                  ws.close(1000, "unmount");
                } catch {
                  /* ignore */
                }
              },
              { once: true },
            );
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
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "typing",
          conversation_id: conversationId,
          is_typing: isTyping,
        }),
      );
    }
  }, []);

  const sendSignal = useCallback((type, targetUserId, payload = {}) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      logCallSignal("ws.send.blocked", type);
      return false;
    }
    wsRef.current.send(
      JSON.stringify({
        type,
        target_user_id: targetUserId,
        ...payload,
      }),
    );
    logCallSignal("ws.send", type);
    return true;
  }, []);

  const reconnect = useCallback(() => {
    closedIntentionallyRef.current = false;
    connect();
  }, [connect]);

  const ensureHealthy = useCallback(() => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reconnect();
        const deadline = Date.now() + 8000;
        const waitOpen = () => {
          const current = wsRef.current;
          if (current?.readyState === WebSocket.OPEN) {
            resolve(true);
            return;
          }
          if (Date.now() > deadline) {
            reject(new Error("WebSocket not open"));
            return;
          }
          setTimeout(waitOpen, 200);
        };
        waitOpen();
        return;
      }

      if (healthWaiterRef.current) {
        reject(new Error("Health check already in progress"));
        return;
      }

      const timeoutId = setTimeout(() => {
        if (healthWaiterRef.current) {
          healthWaiterRef.current = null;
          reject(new Error("WebSocket health timeout"));
        }
      }, 5000);

      healthWaiterRef.current = { resolve, reject, timeoutId };
      try {
        ws.send(JSON.stringify({ type: "ping" }));
        logCallSignal("ws.health.ping", null);
      } catch (err) {
        healthWaiterRef.current = null;
        clearTimeout(timeoutId);
        reject(err);
      }
    }).then(() => {
      logCallSignal("ws.health.ok", null);
      return true;
    });
  }, [reconnect]);

  return {
    connected,
    sendTyping,
    sendSignal,
    ensureHealthy,
    reconnect,
  };
}
