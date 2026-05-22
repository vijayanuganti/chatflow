import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import hi from "@/locales/hi.json";
import te from "@/locales/te.json";
import { getStoredAppLanguage, normalizeLanguage } from "@/lib/appLanguage";

let initPromise = null;

export function initI18n() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const lng = await getStoredAppLanguage();
    if (!i18n.isInitialized) {
      await i18n.use(initReactI18next).init({
        resources: {
          en: { translation: en },
          hi: { translation: hi },
          te: { translation: te },
        },
        lng: normalizeLanguage(lng),
        fallbackLng: "en",
        interpolation: { escapeValue: false },
        react: { useSuspense: false },
      });
    } else {
      await i18n.changeLanguage(normalizeLanguage(lng));
    }
    return i18n;
  })();
  return initPromise;
}

export default i18n;
