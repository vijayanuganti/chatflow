import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  api,
  clearAuthSession,
  getStoredAccessToken,
  setStoredAccessToken,
  setStoredUser,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  AUTH_REMEMBER_KEY,
} from "../lib/api";

const AuthContext = React.createContext(null);

/**
 * JWT is kept in `sessionStorage` for every tab. When "Stay signed in" is on
 * (default), a copy is also kept in `localStorage` so new tabs in the same
 * Chrome profile stay signed in. Each Chrome **profile** has its own storage;
 * switching Gmail inside one Chrome user does not create a new profile.
 */
export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);

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
      if (!getStoredAccessToken()) {
        if (!cancelled) {
          setUserState(null);
          setLoading(false);
        }
        return;
      }

      try {
        const res = await api.get("/auth/verify");
        if (!cancelled) {
          const u = res.data?.user || null;
          setUserState(u);
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
          }
        }
      } catch {
        clearAuthSession();
        if (!cancelled) setUserState(null);
      } finally {
        if (!cancelled) setLoading(false);
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
          const u = res.data?.user || null;
          setUserState(u);
          if (u) setStoredUser(u, readRemember());
        })
        .catch(() => {
          clearAuthSession();
          setUserState(null);
        });
    }

    function onStorage(e) {
      if (e.storageArea !== localStorage) return;
      if (![AUTH_TOKEN_KEY, AUTH_USER_KEY, AUTH_REMEMBER_KEY].includes(e.key)) return;

      if (e.key === AUTH_TOKEN_KEY && !(e.newValue || "").trim()) {
        clearAuthSession();
        setUserState(null);
        return;
      }

      syncFromToken();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const login = useCallback((userData, accessToken, staySignedIn = true) => {
    if (accessToken) setStoredAccessToken(accessToken, staySignedIn);
    if (userData) setStoredUser(userData, staySignedIn);
    else clearAuthSession();
    setUserState(userData || null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    clearAuthSession();
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
