'use client';

import type { ReactNode } from 'react';
import { usePathname }     from 'next/navigation';
import { QueryProvider }   from './QueryProvider';
import { ThemeProvider }   from './ThemeProvider';
import { ToastProvider }   from './ToastProvider';
import { CompanyProvider } from '../../contexts/CompanyContext';
import { useAutoExchangeRateRefresh } from '../../hooks/useExchangeRate';

function AutoRateRefresher() {
  useAutoExchangeRateRefresh(true);
  return null;
}

/**
 * La vitrine d'un marchand n'est pas une page de ProfitPilot.
 *
 * `CompanyProvider` résout l'entreprise de l'UTILISATEUR CONNECTÉ et le
 * rafraîchisseur de taux écrit en base : deux choses qui n'ont aucun sens pour
 * le client d'une boutique, qui n'a pas de compte. Montés sur la vitrine, ils
 * partaient quand même — et répondaient « Non authentifié » en 500, visible
 * dans la console de l'acheteur, sur une connexion qu'on cherche par ailleurs à
 * ménager (§26).
 *
 * La vitrine garde donc le strict nécessaire : le cache de requêtes, le thème,
 * et la zone d'annonces. Elle a ses propres contextes — panier, favoris — posés
 * par son propre layout.
 */
export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isStorefront = pathname?.startsWith('/store/') ?? false;

  if (isStorefront) {
    return (
      <QueryProvider>
        <ThemeProvider>
          <ToastProvider />
          {children}
        </ThemeProvider>
      </QueryProvider>
    );
  }

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
