import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);

const STORAGE_KEY = "cf_theme";
const VALID_THEMES = ["light", "dark", "system"];

/** Chat-area wallpaper only (`data-chat-theme` on document root). Independent of app light/dark. */
export const CHAT_THEME_STORAGE_KEY = "cf_chat_theme";
export const CHAT_THEMES = [
  { id: "default", label: "Classic", hint: "Soft emerald glow" },
  { id: "plain", label: "Plain", hint: "Solid neutral" },
  { id: "mint", label: "Mint", hint: "Fresh green wash" },
  { id: "dusk", label: "Dusk", hint: "Indigo twilight" },
  { id: "warm", label: "Warm", hint: "Paper & sand" },
  { id: "ocean", label: "Ocean", hint: "Cool teal depth" },
  { id: "dots", label: "Dots", hint: "Subtle grid" },
];
const VALID_CHAT_THEMES = CHAT_THEMES.map((t) => t.id);

function systemPrefersDark() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStoredTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VALID_THEMES.includes(raw)) return raw;
  } catch {
    // ignore
  }
  return "system";
}

function readStoredChatTheme() {
  try {
    const raw = localStorage.getItem(CHAT_THEME_STORAGE_KEY);
    if (raw && VALID_CHAT_THEMES.includes(raw)) return raw;
  } catch {
    // ignore
  }
  return "default";
}

function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const isDark = theme === "dark" || (theme === "system" && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", isDark);
  // Help mobile browsers theme the chrome / status bar.
  root.style.colorScheme = isDark ? "dark" : "light";
}

function applyChatTheme(chatTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const id = VALID_CHAT_THEMES.includes(chatTheme) ? chatTheme : "default";
  root.setAttribute("data-chat-theme", id);
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStoredTheme());
  const [chatTheme, setChatThemeState] = useState(() => readStoredChatTheme());

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useLayoutEffect(() => {
    applyChatTheme(chatTheme);
  }, [chatTheme]);

  // Respond to OS-level theme changes only while in "system" mode.
  useEffect(() => {
    if (theme !== "system") return undefined;
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handler);
      else mql.removeListener(handler);
    };
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (!VALID_THEMES.includes(next)) return;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    setThemeState(next);
  }, []);

  const setChatTheme = useCallback((next) => {
    if (!VALID_CHAT_THEMES.includes(next)) return;
    try {
      localStorage.setItem(CHAT_THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
    setChatThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    // Quick toggle ignores "system" — flip between light and dark. Pick "System" in Profile → Themes.
    const current = theme === "dark" || (theme === "system" && systemPrefersDark()) ? "dark" : "light";
    setTheme(current === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme,
    chatTheme,
    setChatTheme,
    isDark:
      theme === "dark" || (theme === "system" && systemPrefersDark()),
  }), [theme, setTheme, toggleTheme, chatTheme, setChatTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
