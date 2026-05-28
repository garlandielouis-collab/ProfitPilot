'use client';

import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Language = 'fr' | 'ht';

type Translations = { fr: string; ht: string };

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (translations: Translations) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageWrapper({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('fr');

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
