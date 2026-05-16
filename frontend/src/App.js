import React, { useEffect } from "react";
import "@/App.css";
import { registerServiceWorker } from "@/lib/notify";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import LoginPage from "@/pages/Login";
import ChatApp from "@/pages/ChatApp";
import AdminDashboard from "@/pages/AdminDashboard";
import ProfileSettingsPage from "@/pages/ProfileSettingsPage";
import CreateAccountPage from "@/pages/CreateAccountPage";
import MedicalProfilePage from "@/pages/MedicalProfilePage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import UserAccountDetailPage from "@/pages/UserAccountDetailPage";
import NewConversationPage from "@/pages/NewConversationPage";
import DietPlanPage from "@/pages/DietPlanPage";
import UserProfilePage from "@/pages/UserProfilePage";
import RaiseComplaintPage from "@/pages/RaiseComplaintPage";
import { Toaster } from "@/components/ui/sonner";
import PushNotificationBootstrap from "@/components/PushNotificationBootstrap";
import InAppMessageBanner from "@/components/InAppMessageBanner";
import SplashScreenBootstrap from "@/components/SplashScreenBootstrap";
import PanelErrorBoundary from "@/components/PanelErrorBoundary";
import { initNativeAuthSync } from "@/lib/nativeAuthSync";
import { initAppForegroundSync } from "@/lib/activeChatState";
import { syncConversationSoundsFromNative } from "@/lib/conversationSounds";

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-500" data-testid="loading-screen">
        Loading...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  const role = (user.role || "").toLowerCase();
  if (roles && !roles.includes(role)) return <Navigate to="/" replace />;
  return children;
}

function AuthLoadingScreen() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500 dark:bg-gray-950 dark:text-gray-400"
      data-testid="loading-screen"
    >
      Loading...
    </div>
  );
}

function RoleRouter() {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  const role = (user.role || "").toLowerCase();
  if (role === "admin") return <Navigate to="/admin" replace />;
  return <Navigate to="/chat" replace />;
}

function ServiceWorkerBootstrap() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}

function NativeAuthBootstrap() {
  useEffect(() => {
    initNativeAuthSync();
    initAppForegroundSync();
    void syncConversationSoundsFromNative();
  }, []);
  return null;
}

function App() {
  return (
    <div className="App min-h-0 overflow-x-hidden">
      <ServiceWorkerBootstrap />
      <ThemeProvider>
      <AuthProvider>
        <NativeAuthBootstrap />
        <SplashScreenBootstrap />
        <BrowserRouter>
          <PushNotificationBootstrap />
          <InAppMessageBanner />
          <Routes>
            <Route path="/" element={<RoleRouter />} />
            <Route path="/login" element={<LoginPage />} />
            {/* Self-registration and password-reset are disabled.
                Accounts are created by administrators only. */}
            <Route path="/register" element={<Navigate to="/login" replace />} />
            <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
            <Route
              path="/chat"
              element={
                <Protected roles={["employee", "client", "admin"]}>
                  <ChatApp />
                </Protected>
              }
            />
            <Route
              path="/chat/profile"
              element={
                <Protected roles={["employee", "client", "admin"]}>
                  <ProfileSettingsPage />
                </Protected>
              }
            />
            <Route
              path="/chat/create-account"
              element={
                <Protected roles={["employee", "client", "admin"]}>
                  <CreateAccountPage />
                </Protected>
              }
            />
            <Route
              path="/chat/medical"
              element={
                <Protected roles={["employee", "client", "admin"]}>
                  <MedicalProfilePage />
                </Protected>
              }
            />
            <Route
              path="/chat/medical/:userId"
              element={
                <Protected roles={["employee", "client", "admin"]}>
                  <MedicalProfilePage />
                </Protected>
              }
            />
            <Route
              path="/chat/new-conversation"
              element={
                <Protected roles={["employee", "client", "admin"]}>
                  <NewConversationPage />
                </Protected>
              }
            />
            <Route
              path="/chat/complaint"
              element={
                <Protected roles={["client"]}>
                  <RaiseComplaintPage />
                </Protected>
              }
            />
            <Route
              path="/chat/diet-plan"
              element={
                <Protected roles={["employee", "client", "admin"]}>
                  <DietPlanPage />
                </Protected>
              }
            />
            <Route
              path="/chat/diet-plan/:clientId"
              element={
                <Protected roles={["employee", "client", "admin"]}>
                  <DietPlanPage />
                </Protected>
              }
            />
            <Route
              path="/chat/contact/:userId"
              element={
                <Protected roles={["employee", "client", "admin"]}>
                  <UserProfilePage />
                </Protected>
              }
            />
            <Route
              path="/admin/profile"
              element={
                <Protected roles={["admin"]}>
                  <ProfileSettingsPage />
                </Protected>
              }
            />
            <Route
              path="/admin/create-account"
              element={
                <Protected roles={["admin"]}>
                  <CreateAccountPage />
                </Protected>
              }
            />
            <Route
              path="/admin/users/:userId/reset-password"
              element={
                <Protected roles={["admin"]}>
                  <ResetPasswordPage />
                </Protected>
              }
            />
            <Route
              path="/admin/users/:userId/medical"
              element={
                <Protected roles={["admin"]}>
                  <MedicalProfilePage />
                </Protected>
              }
            />
            <Route
              path="/admin/users/:userId/diet-plan"
              element={
                <Protected roles={["admin"]}>
                  <DietPlanPage />
                </Protected>
              }
            />
            <Route
              path="/admin/users/:userId"
              element={
                <Protected roles={["admin"]}>
                  <UserAccountDetailPage />
                </Protected>
              }
            />
            <Route
              path="/admin/contact/:userId"
              element={
                <Protected roles={["admin"]}>
                  <UserProfilePage />
                </Protected>
              }
            />
            <Route
              path="/admin/:section?"
              element={
                <Protected roles={["admin"]}>
                  <PanelErrorBoundary fallbackPath="/login">
                    <AdminDashboard />
                  </PanelErrorBoundary>
                </Protected>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" />
      </AuthProvider>
      </ThemeProvider>
    </div>
  );
}

export default App;
