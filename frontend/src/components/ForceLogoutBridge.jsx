import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import useChatSocket from "@/hooks/useChatSocket";
import {
  LOGOUT_REASON_ANOTHER_DEVICE,
  performForcedLogout,
  registerLogoutCleanup,
  validateSessionQuick,
} from "@/lib/forcedLogout";

const POLL_MS = 3000;

/**
 * Global single-session listener: WebSocket force_logout, foreground validate, 3s poll fallback.
 */
export default function ForceLogoutBridge() {
  const { user } = useAuth();
  const pollRef = useRef(null);

  const onForceLogout = (data) => {
    const reason = data?.reason || LOGOUT_REASON_ANOTHER_DEVICE;
    performForcedLogout({ reason, showModal: true });
  };

  useChatSocket({
    enabled: Boolean(user?.id),
    onForceLogout,
  });

  useEffect(() => {
    if (!user?.id) return undefined;

    const check = async () => {
      try {
        const result = await validateSessionQuick();
        if (!result.valid && result.reason === LOGOUT_REASON_ANOTHER_DEVICE) {
          performForcedLogout({ reason: result.reason, showModal: true });
        }
      } catch {
        /* 401 handled by api interceptor */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);

    pollRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [user?.id]);

  useEffect(() => {
    return registerLogoutCleanup(() => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    });
  }, []);

  return null;
}
