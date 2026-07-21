'use client';

import type { ReactNode } from 'react';
import { QueryProvider }   from './QueryProvider';
import { ThemeProvider }   from './ThemeProvider';
import { ToastProvider }   from './ToastProvider';
import { CompanyProvider } from '../../contexts/CompanyContext';
import { useAutoExchangeRateRefresh } from '../../hooks/useExchangeRate';

function AutoRateRefresher() {
  useAutoExchangeRateRefresh(true);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <CompanyProvider>
          <ToastProvider />
          <AutoRateRefresher />
          {children}
        </CompanyProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
