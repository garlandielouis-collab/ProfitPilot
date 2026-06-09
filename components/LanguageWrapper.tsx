'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Language = 'fr' | 'ht';

type Translations = { fr: string; ht: string };

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (translations: Translations) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANG_KEY = 'pp_language';

export function LanguageWrapper({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('fr');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(LANG_KEY) as Language | null;
    if (saved === 'fr' || saved === 'ht') {
      setLanguageState(saved);
    }
    setHydrated(true);
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(LANG_KEY, lang);
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: ({ fr, ht }: Translations) => (language === 'ht' ? ht : fr),
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageWrapper');
  }
  return context;
}
