import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { notificationNavigationTarget } from "@/lib/appRoutes";
import { syncNativeAuthForPush } from "@/lib/nativeAuthSync";
import {
  initCapacitorPush,
  teardownCapacitorPush,
  NOTIFICATION_MARK_READ_EVENT,
} from "@/lib/push";

/**
 * Registers FCM on native after login and routes notification taps into chat.
 */
export default function PushNotificationBootstrap() {
  const { user } = useAuth();
  const userRef = useRef(user);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!user?.id) {
      teardownCapacitorPush();
      return undefined;
    }

    void syncNativeAuthForPush();
    void initCapacitorPush(
      user.id,
      (notification) => {
        const convId = notification?.data?.conversation_id;
        const role = userRef.current?.role;
        const target = notificationNavigationTarget(role, convId);
        navigateRef.current(
          { pathname: target.pathname, search: target.search || "" },
          { state: target.state },
        );
      },
      (detail) => {
        const convId = detail?.conversationId;
        if (!convId) return;
        try {
          window.dispatchEvent(
            new CustomEvent(NOTIFICATION_MARK_READ_EVENT, { detail }),
          );
        } catch {
          /* ignore */
        }
      },
    );

    return () => teardownCapacitorPush();
  }, [user?.id]);

  return null;
}
