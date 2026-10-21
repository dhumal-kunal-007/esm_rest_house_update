
import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import type { Language } from "./translations";
import { translations } from "./translations";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (section: string, key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined
);

export function LanguageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [language, setLanguageState] = useState<Language>(() => {
    const savedLanguage = localStorage.getItem(
      "esm_language"
    ) as Language | null;

    return savedLanguage === "mr" ? "mr" : "en";
  });

  const setLanguage = (nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    localStorage.setItem("esm_language", nextLanguage);
  };

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "mr" : "en");
  };

  const t = (section: string, key: string): string => {
    const sectionData = translations[language][
      section as keyof typeof translations[typeof language]
    ];

    if (
      sectionData &&
      typeof sectionData === "object" &&
      key in sectionData
    ) {
      return String(
        (sectionData as Record<string, unknown>)[key]
      );
    }

    return key;
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t,
    }),
    [language]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// The context hook is intentionally exported alongside its provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error(
      "useLanguage must be used inside LanguageProvider"
    );
  }

  return context;
}