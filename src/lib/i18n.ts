import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import fr from "@/locales/fr.json";
import en from "@/locales/en.json";

// Important: SSR-safe — default language is FR on BOTH server and client.
// We only switch on the client after mount, via setLanguage(), to avoid hydration mismatch.

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    lng: "fr",
    fallbackLng: "fr",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export const LANG_KEY = "retailux.lang";

export function setLanguage(lng: "fr" | "en") {
  void i18n.changeLanguage(lng);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LANG_KEY, lng);
      document.documentElement.lang = lng;
    } catch {}
  }
}

export function hydrateLanguageFromStorage() {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(LANG_KEY) as "fr" | "en" | null;
    if (stored && stored !== i18n.language) {
      void i18n.changeLanguage(stored);
      document.documentElement.lang = stored;
    } else {
      document.documentElement.lang = i18n.language;
    }
  } catch {}
}

export function useT() {
  const { t, i18n: i } = useTranslation();
  return { t, lang: i.language as "fr" | "en", setLang: (l: "fr" | "en") => setLanguage(l) };
}

// Locale-aware date formatter — uses i18n language at render time.
export function formatDate(iso: string, lng: string, opts?: Intl.DateTimeFormatOptions) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(lng === "fr" ? "fr-FR" : "en-US", opts ?? { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function formatDateTime(iso: string, lng: string) {
  return formatDate(iso, lng, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Minutes elapsed since an ISO timestamp — feeds relativeFromMinutes for
// server-provided created_at strings (as opposed to the old mock data's
// pre-baked minutesAgo numbers).
export function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

// Relative time from minutes — small helper used by notifications.
export function relativeFromMinutes(min: number, t: (k: string, p?: any) => string) {
  if (min < 1) return t("time.now");
  if (min < 60) return t("time.minAgo", { count: min });
  const h = Math.round(min / 60);
  if (h < 24) return t("time.hAgo", { count: h });
  const d = Math.round(h / 24);
  return t("time.dAgo", { count: d });
}

export default i18n;
