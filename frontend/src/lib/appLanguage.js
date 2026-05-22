import i18n from "@/i18n";

export const APP_LANGUAGE_KEY = "app_language";
export const SUPPORTED_LANGUAGES = ["en", "hi", "te"];

const LANGUAGE_CODES = { en: "EN", hi: "HI", te: "TE" };

export function normalizeLanguage(code) {
  const c = String(code || "en").trim().toLowerCase();
  return SUPPORTED_LANGUAGES.includes(c) ? c : "en";
}

export function languageDisplayCode(code) {
  return LANGUAGE_CODES[normalizeLanguage(code)] || "EN";
}

/** Persist language (localStorage; works in Capacitor WebView). */
export async function persistAppLanguage(code) {
  const lang = normalizeLanguage(code);
  try {
    localStorage.setItem(APP_LANGUAGE_KEY, lang);
  } catch {
    /* quota */
  }
  return lang;
}

export async function getStoredAppLanguage() {
  try {
    const raw = localStorage.getItem(APP_LANGUAGE_KEY);
    if (raw) return normalizeLanguage(raw);
  } catch {
    /* ignore */
  }
  return "en";
}

/**
 * Switch app language instantly and optionally sync to server.
 * @param {string} code
 * @param {{ skipServer?: boolean, userId?: string }} options
 */
export async function setAppLanguage(code, options = {}) {
  const lang = normalizeLanguage(code);
  await persistAppLanguage(lang);
  await i18n.changeLanguage(lang);
  if (!options.skipServer && options.userId) {
    const { patchUserPreferences } = await import("@/lib/userPreferencesApi");
    await patchUserPreferences({ language: lang }).catch(() => {});
  }
  return lang;
}
