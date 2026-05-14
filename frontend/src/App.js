import React, { useEffect } from "react";
import "@/App.css";
import { registerServiceWorker } from "@/lib/notify";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import LoginPage from "@/pages/Login";
import ChatApp from "@/pages/ChatApp";
import AdminDashboard from "@/pages/AdminDashboard";
import { Toaster } from "@/components/ui/sonner";

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
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function RoleRouter() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  return <Navigate to="/chat" replace />;
}

function ServiceWorkerBootstrap() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}

function App() {
  return (
    <div className="App min-h-0 overflow-x-hidden">
      <ServiceWorkerBootstrap />
      <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
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
              path="/admin/:section?"
              element={
                <Protected roles={["admin"]}>
                  <AdminDashboard />
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
