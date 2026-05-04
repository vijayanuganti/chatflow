import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import LoginPage from "@/pages/Login";
import RegisterPage from "@/pages/Register";
import ForgotPasswordPage from "@/pages/ForgotPassword";
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

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RoleRouter />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
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
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" />
      </AuthProvider>
    </div>
  );
}

export default App;
