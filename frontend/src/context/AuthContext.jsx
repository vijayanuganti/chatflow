import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  api,
  clearAuthSession,
  getStoredAccessToken,
  setStoredAccessToken,
  setStoredUser,
  syncBrowserIdFromToken,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  AUTH_REMEMBER_KEY,
} from "../lib/api";
import { syncNativeAuthForPush } from "../lib/nativeAuthSync";
import { get401LogoutReason, performForcedLogout, clearSessionLocally } from "../lib/forcedLogout";
import { executeLogout } from "../lib/logoutFlow";
import { runLoggedOutNotificationGuard } from "../lib/logoutCleanup";
import { setAppLanguage, normalizeLanguage } from "../lib/appLanguage";

const AuthContext = React.createContext(null);

function normalizeUser(userData) {
  if (!userData || typeof userData !== "object") return userData;
  const u = { ...userData };
  if (typeof u.role === "string") u.role = u.role.trim().toLowerCase();
  return u;
}

/**
 * JWT is kept in `sessionStorage` for every tab. When "Stay signed in" is on
 * (default), a copy is also kept in `localStorage` so new tabs in the same
 * Chrome profile stay signed in. Each Chrome **profile** has its own storage;
 * switching Gmail inside one Chrome user does not create a new profile.
 */
export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const bootGenerationRef = useRef(0);

  /** Updates React state and mirrors the user into storage when non-null. */
  const setUser = useCallback((next) => {
    setUserState(next);
    const remember = (() => {
      try {
        const r = (localStorage.getItem(AUTH_REMEMBER_KEY) || "").trim();
        if (r === "0") return false;
        return true;
      } catch {
        return true;
      }
    })();
    if (next) setStoredUser(next, remember);
    else clearAuthSession();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const generation = ++bootGenerationRef.current;

      if (!getStoredAccessToken()) {
        await runLoggedOutNotificationGuard();
        if (!cancelled && generation === bootGenerationRef.current) {
          setUserState(null);
          setLoading(false);
        }
        return;
      }

      try {
        const res = await api.get("/auth/verify");
        if (!cancelled && generation === bootGenerationRef.current) {
          const u = normalizeUser(res.data?.user || null);
          setUserState(u);
          if (u?.language) {
            await setAppLanguage(u.language, { skipServer: true });
          }
          if (u) {
            const remember = (() => {
              try {
                const r = (localStorage.getItem(AUTH_REMEMBER_KEY) || "").trim();
                if (r === "0") return false;
                return true;
              } catch {
                return true;
              }
            })();
            setStoredUser(u, remember);
            void syncNativeAuthForPush();
          }
        }
      } catch (err) {
        if (!cancelled && generation === bootGenerationRef.current) {
          const reason = get401LogoutReason(err);
          if (reason) {
            performForcedLogout({ reason, showModal: true });
          } else {
            clearSessionLocally();
            await runLoggedOutNotificationGuard();
            setUserState(null);
          }
        }
      } finally {
        if (!cancelled && generation === bootGenerationRef.current) {
          setLoading(false);
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cross-tab: shared `localStorage` changes (logout / login in another tab).
  useEffect(() => {
    function readRemember() {
      try {
        const r = (localStorage.getItem(AUTH_REMEMBER_KEY) || "").trim();
        if (r === "0") return false;
        return true;
      } catch {
        return true;
      }
    }

    function syncFromToken() {
      const token = getStoredAccessToken();
      if (!token) {
        clearAuthSession();
        setUserState(null);
        return;
      }
      api
        .get("/auth/verify")
        .then((res) => {
          const u = normalizeUser(res.data?.user || null);
          setUserState(u);
          if (u) {
            setStoredUser(u, readRemember());
            void syncNativeAuthForPush();
          }
        })
        .catch(() => {
          clearSessionLocally();
          void runLoggedOutNotificationGuard();
          setUserState(null);
        });
    }

    function onStorage(e) {
      if (e.storageArea !== localStorage) return;
      if (![AUTH_TOKEN_KEY, AUTH_USER_KEY, AUTH_REMEMBER_KEY].includes(e.key)) return;

      if (e.key === AUTH_TOKEN_KEY && !(e.newValue || "").trim()) {
        void runLoggedOutNotificationGuard().finally(() => {
          clearSessionLocally();
          setUserState(null);
        });
        return;
      }

      syncFromToken();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const onForceLogout = () => {
      bootGenerationRef.current += 1;
      setUserState(null);
      setLoading(false);
    };
    window.addEventListener("chatflow:force_logout", onForceLogout);
    return () => window.removeEventListener("chatflow:force_logout", onForceLogout);
  }, []);

  const login = useCallback((userData, accessToken, staySignedIn = true) => {
    // Ignore any in-flight session restore so it cannot overwrite this login.
    bootGenerationRef.current += 1;
    if (accessToken) {
      syncBrowserIdFromToken(accessToken);
      setStoredAccessToken(accessToken, staySignedIn);
    }
    const normalized = normalizeUser(userData) || null;
    if (normalized) setStoredUser(normalized, staySignedIn);
    else clearAuthSession();
    setUserState(normalized);
    setLoading(false);
    if (normalized?.language) {
      void setAppLanguage(normalized.language, { skipServer: true });
    }
    void syncNativeAuthForPush();
  }, []);

  const logout = useCallback(async () => {
    await executeLogout({ mode: "manual", showModal: false, navigateToLogin: true });
    setUserState(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
