'use client';

import type { ReactNode } from 'react';
import { QueryProvider }  from './QueryProvider';
import { ThemeProvider }  from './ThemeProvider';
import { ToastProvider }  from './ToastProvider';

/**
 * Top-level client provider tree.
 * Wrap the entire app once in layout.tsx.
 *
 *   QueryProvider  ─ TanStack Query client
 *   ThemeProvider  ─ dark / light mode (localStorage "pp-theme")
 *   ToastProvider  ─ Sonner toast renderer (depends on ThemeProvider)
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <ToastProvider />
        {children}
      </ThemeProvider>
    </QueryProvider>
  );
}
