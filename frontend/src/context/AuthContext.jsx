import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";

const AuthContext = createContext(null);

/**
 * Per-tab session marker.
 *
 * ChatFlow authenticates via an HttpOnly cookie. Cookies are shared between
 * tabs / windows on the same browser, so a user who copies their URL and
 * pastes it in another tab would normally appear logged in.
 *
 * To stop that, we gate every page load on a `sessionStorage` marker that
 * was set during the explicit `login()` flow. `sessionStorage` is per-tab:
 *   - a refresh (F5) of the same tab keeps the marker → user stays logged in
 *   - opening a new tab gets an empty `sessionStorage` → we force a logout
 *     (clear the server cookie) and bounce to /login
 *
 * The marker also doubles as cross-tab logout: if one tab logs out, others
 * detect the change via the `storage` event and drop their session too.
 */
const TAB_SESSION_KEY = "cf_tab_session";

function startTabSession() {
  try {
    sessionStorage.setItem(TAB_SESSION_KEY, "1");
  } catch {
    // ignore (private browsing edge cases)
  }
}

function hasTabSession() {
  try {
    return sessionStorage.getItem(TAB_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function clearTabSession() {
  try {
    sessionStorage.removeItem(TAB_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Boot-time: only trust the cookie if this tab has been authenticated.
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!hasTabSession()) {
        // New tab / URL pasted: pre-emptively clear any inherited cookie so the
        // user must sign in again here. Failure is fine — the cookie might
        // already be invalid / missing.
        try {
          await api.post("/auth/logout");
        } catch {
          // ignore
        }
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const res = await api.get("/auth/verify");
        if (!cancelled) setUser(res.data?.user || null);
      } catch {
        // Cookie expired or invalid → drop the tab marker too.
        clearTabSession();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cross-tab logout: if another tab logs out (clears the marker), drop here too.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === TAB_SESSION_KEY && !e.newValue) {
        setUser(null);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const login = useCallback((userData) => {
    if (userData) startTabSession();
    setUser(userData || null);
  }, []);

  const logout = useCallback(async () => {
    clearTabSession();
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore
    }
    setUser(null);
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
