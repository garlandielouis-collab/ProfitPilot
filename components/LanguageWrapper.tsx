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

/**
 * Kreyòl par défaut, français en option (étude de marché inversée, §4 et
 * §11.1). Beaucoup de patrons savent lire le français ; peu ont le temps de le
 * lire, et « aplikasyon yo pa fèt pou moun tankou m » commence à la première
 * phrase dans une langue qui n'est pas la leur. Le choix enregistré, lui, est
 * toujours respecté : qui a choisi le français le garde.
 */
export const DEFAULT_LANGUAGE: Language = 'ht';

export function LanguageWrapper({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY) as Language | null;
      if (saved === 'fr' || saved === 'ht') {
        setLanguageState(saved);
      }
    } catch { /* stockage indisponible : la langue par défaut tient */ }
    setHydrated(true);
  }, []);

  // `<html lang>` suit la langue affichée : un lecteur d'écran lit le kreyòl
  // avec une voix kreyòl, pas avec la prononciation française.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* choix non retenu, sans plus */ }
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
