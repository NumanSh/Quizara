import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import en, { type Translations } from "@/locales/en";
import ar from "@/locales/ar";

const LOCALES: Record<string, Translations> = { en, ar };
const STORAGE_KEY = "quizara_lang";

type Lang = "en" | "ar";

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  setLang: () => {},
  t: en,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return (stored === "ar" ? "ar" : "en") as Lang;
  });

  const applyLang = useCallback((l: Lang) => {
    const translations = LOCALES[l] ?? en;
    document.documentElement.setAttribute("lang", l);
    document.documentElement.setAttribute("dir", translations.dir);
    if (l === "ar") {
      document.documentElement.classList.add("font-arabic");
    } else {
      document.documentElement.classList.remove("font-arabic");
    }
  }, []);

  useEffect(() => {
    applyLang(lang);
  }, [lang, applyLang]);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
    applyLang(l);
  }, [applyLang]);

  const value: I18nContextValue = {
    lang,
    setLang,
    t: LOCALES[lang] ?? en,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
