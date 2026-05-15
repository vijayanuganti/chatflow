import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { initCapacitorPush, teardownCapacitorPush } from "@/lib/push";

/**
 * Registers FCM on native after login and routes notification taps into chat.
 */
export default function PushNotificationBootstrap() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    if (!user?.id) {
      teardownCapacitorPush();
      return undefined;
    }

    void initCapacitorPush(user.id, (notification) => {
      const convId = notification?.data?.conversation_id;
      navigateRef.current("/chat", {
        state: convId ? { conversationId: convId } : undefined,
      });
    });

    return () => teardownCapacitorPush();
  }, [user?.id]);

  return null;
}
