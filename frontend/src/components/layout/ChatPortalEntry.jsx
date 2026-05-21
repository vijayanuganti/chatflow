import React from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import ChatApp from "@/pages/ChatApp";
import ChatPanelLayout from "@/components/layout/ChatPanelLayout";
import ProfileSettingsPage from "@/pages/ProfileSettingsPage";
import PanelErrorBoundary from "@/components/PanelErrorBoundary";

/**
 * Admin uses legacy full-page ChatApp; employees/clients use sidebar layout + nested routes.
 */
export default function ChatPortalEntry() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const role = (user?.role || "").toLowerCase();

  if (role === "admin") {
    if (pathname === "/chat/profile") {
      return (
        <PanelErrorBoundary fallbackPath="/login">
          <ProfileSettingsPage />
        </PanelErrorBoundary>
      );
    }
    return (
      <PanelErrorBoundary fallbackPath="/login">
        <ChatApp />
      </PanelErrorBoundary>
    );
  }

  if (role === "employee" || role === "client") {
    return (
      <PanelErrorBoundary fallbackPath="/login">
        <ChatPanelLayout />
      </PanelErrorBoundary>
    );
  }

  return null;
}
