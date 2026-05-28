'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

type ThemeCtx = {
  theme:     Theme;
  setTheme:  (t: Theme) => void;
  toggle:    () => void;
  isDark:    boolean;
};

const ThemeContext = createContext<ThemeCtx | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  // Sync from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('pp-theme') as Theme | null;
    if (saved === 'dark' || saved === 'light') {
      setThemeState(saved);
      document.documentElement.classList.toggle('dark', saved === 'dark');
    }
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('pp-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  };

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      isDark: theme === 'dark',
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}
