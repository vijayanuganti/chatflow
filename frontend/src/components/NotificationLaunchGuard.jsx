import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { useAuth } from "@/context/AuthContext";
import { getStoredAccessToken } from "@/lib/api";
import { guardNotificationsOnLaunch } from "@/lib/logoutFlow";

/**
 * Ensures logged-out devices do not keep push tokens, tray notifications, or listeners.
 */
export default function NotificationLaunchGuard() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user?.id) {
      void guardNotificationsOnLaunch();
    }
  }, [user?.id, loading]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let handle;
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive && !getStoredAccessToken()) {
        void guardNotificationsOnLaunch();
      }
    })
      .then((h) => {
        handle = h;
      })
      .catch(() => {});
    return () => {
      try {
        handle?.remove();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return null;
}
