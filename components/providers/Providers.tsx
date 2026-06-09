'use client';

import type { ReactNode } from 'react';
import { QueryProvider }  from './QueryProvider';
import { ThemeProvider }  from './ThemeProvider';
import { ToastProvider }  from './ToastProvider';
import { useAutoExchangeRateRefresh } from '../../hooks/useExchangeRate';

function AutoRateRefresher() {
  useAutoExchangeRateRefresh(true);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <ToastProvider />
        <AutoRateRefresher />
        {children}
      </ThemeProvider>
    </QueryProvider>
  );
}
