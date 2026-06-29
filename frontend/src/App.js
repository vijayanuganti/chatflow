import React, { useEffect } from "react";
import "@/App.css";
import { registerServiceWorker } from "@/lib/notify";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { getStoredAccessToken } from "@/lib/api";
import { ChatProvider } from "@/context/ChatContext";
import { ChatSocketProvider } from "@/context/ChatSocketContext";
import { CallProvider } from "@/context/CallContext";
import GlobalCallOverlay from "@/components/call/GlobalCallOverlay";
import GlobalCallBridge from "@/components/call/GlobalCallBridge";
import CallHistoryPage from "@/pages/CallHistoryPage";
import RingtoneSettingsPage from "@/pages/RingtoneSettingsPage";
import { GlobalCallBackground } from "@/hooks/useCallBackgroundRoute";
import { ThemeProvider } from "@/context/ThemeContext";
import LoginPage from "@/pages/Login";
import ChatApp from "@/pages/ChatApp";
import ChatIndexRoute from "@/components/layout/ChatIndexRoute";
import ChatPortalEntry from "@/components/layout/ChatPortalEntry";
import AdminDashboard from "@/pages/AdminDashboard";
import ProfileSettingsPage from "@/pages/ProfileSettingsPage";
import CreateAccountPage from "@/pages/CreateAccountPage";
import MedicalProfilePage from "@/pages/MedicalProfilePage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import UserAccountDetailPage from "@/pages/UserAccountDetailPage";
import EmployeeDetailPage from "@/pages/EmployeeDetailPage";
import EmployeeBatchClientsPage from "@/pages/EmployeeBatchClientsPage";
import NewConversationPage from "@/pages/NewConversationPage";
import DietPlanPage from "@/pages/DietPlanPage";
import UserProfilePage from "@/pages/UserProfilePage";
import RaiseComplaintPage from "@/pages/RaiseComplaintPage";
import FolderBrowsePage from "@/pages/FolderBrowsePage";
import FolderDetailPage from "@/pages/FolderDetailPage";
import ReferralDetailPage from "@/pages/ReferralDetailPage";
import ToolsPage from "@/pages/ToolsPage";
import { Toaster } from "@/components/ui/sonner";
import PushNotificationBootstrap from "@/components/PushNotificationBootstrap";
import InAppMessageBanner from "@/components/InAppMessageBanner";
import SplashScreenBootstrap from "@/components/SplashScreenBootstrap";
import PanelErrorBoundary from "@/components/PanelErrorBoundary";
import { initNativeAuthSync } from "@/lib/nativeAuthSync";
import { initAppForegroundSync } from "@/lib/activeChatState";
import { initSafeAreaInsets } from "@/lib/safeAreaInsets";
import { syncConversationSoundsFromNative } from "@/lib/conversationSounds";
import { ensureChatFlowFoldersExist } from "@/utils/fileSystem";
import ForceLogoutBridge from "@/components/ForceLogoutBridge";
import NotificationLaunchGuard from "@/components/NotificationLaunchGuard";
import ShareIntentProvider from "@/components/share/ShareIntentProvider";
import I18nGate from "@/components/I18nGate";
import NativeMediaOpenProgress from "@/components/NativeMediaOpenProgress";
import { useTranslation } from "react-i18next";

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-500" data-testid="loading-screen">
        {t("common.loading")}
      </div>
    );
  }
  if (!user || !getStoredAccessToken()) return <Navigate to="/login" replace />;
  const role = (user.role || "").toLowerCase();
  if (roles && !roles.includes(role)) return <Navigate to="/" replace />;
  return children;
}

function AuthLoadingScreen() {
  const { t } = useTranslation();
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500 dark:bg-gray-950 dark:text-gray-400"
      data-testid="loading-screen"
    >
      {t("common.loading")}
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
    const clearSafeAreaInsets = initSafeAreaInsets();
    void syncConversationSoundsFromNative();
    void ensureChatFlowFoldersExist();
    return clearSafeAreaInsets;
  }, []);
  return null;
}

function App() {
  return (
    <div className="App min-h-0 overflow-x-hidden">
      <ServiceWorkerBootstrap />
      <I18nGate>
      <ThemeProvider>
      <AuthProvider>
        <ChatSocketProvider>
        <CallProvider>
        <GlobalCallBridge />
        <GlobalCallOverlay />
        <ForceLogoutBridge />
        <NotificationLaunchGuard />
        <ShareIntentProvider>
        <NativeAuthBootstrap />
        <SplashScreenBootstrap />
        <BrowserRouter>
          <ChatProvider>
          <GlobalCallBackground />
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
                  <ChatPortalEntry />
                </Protected>
              }
            >
              <Route index element={<ChatIndexRoute />} />
              <Route path="profile" element={<ProfileSettingsPage panelLayout />} />
              <Route
                path="settings/ringtone"
                element={
                  <Protected roles={["employee", "client"]}>
                    <RingtoneSettingsPage panelLayout />
                  </Protected>
                }
              />
              <Route path="tools" element={<ToolsPage panelLayout />} />
              <Route path="diet-plan" element={<DietPlanPage panelLayout />} />
              <Route path="diet-plan/:clientId" element={<DietPlanPage panelLayout />} />
              <Route
                path="folders"
                element={
                  <Protected roles={["employee", "client"]}>
                    <FolderBrowsePage />
                  </Protected>
                }
              />
              <Route
                path="folders/:folderId"
                element={
                  <Protected roles={["employee", "client"]}>
                    <FolderDetailPage />
                  </Protected>
                }
              />
              <Route
                path="calls"
                element={
                  <Protected roles={["employee", "client"]}>
                    <CallHistoryPage panelLayout />
                  </Protected>
                }
              />
            </Route>
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
              path="/admin/settings/ringtone"
              element={
                <Protected roles={["admin"]}>
                  <RingtoneSettingsPage />
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
              path="/admin/users/:userId/employee/batches/:batchId"
              element={
                <Protected roles={["admin"]}>
                  <EmployeeBatchClientsPage />
                </Protected>
              }
            />
            <Route
              path="/admin/users/:userId/employee"
              element={
                <Protected roles={["admin"]}>
                  <EmployeeDetailPage />
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
              path="/admin/referrals/:referralId"
              element={
                <Protected roles={["admin"]}>
                  <ReferralDetailPage />
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
          <Toaster position="top-right" />
          <NativeMediaOpenProgress />
          </ChatProvider>
        </BrowserRouter>
        </ShareIntentProvider>
        </CallProvider>
        </ChatSocketProvider>
      </AuthProvider>
      </ThemeProvider>
      </I18nGate>
    </div>
  );
}

export default App;
