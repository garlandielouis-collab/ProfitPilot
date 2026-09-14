'use client';

import type { ReactNode } from 'react';
import { usePathname }     from 'next/navigation';
import { QueryProvider }   from './QueryProvider';
import { ThemeProvider }   from './ThemeProvider';
import { ToastProvider }   from './ToastProvider';
import { CompanyProvider, useCompanyContext } from '../../contexts/CompanyContext';
import { useAutoExchangeRateRefresh } from '../../hooks/useExchangeRate';

/**
 * Le rafraîchissement automatique du taux USD/HTG.
 *
 * Il n'a de sens que pour un marchand connecté : l'action qui enregistre le
 * taux écrit dans SON entreprise. Montée sans session — sur la page d’accueil,
 * l'écran de connexion, les tarifs —, elle partait quand même et répondait 500
 * (« Non authentifié »), une fonction serveur réveillée et une erreur dans les
 * journaux pour chaque visiteur anonyme.
 *
 * `company` vient du contexte : il n'est renseigné que lorsqu'une session a
 * résolu une entreprise. Aucun appel supplémentaire pour le savoir.
 */
function AutoRateRefresher() {
  const { company } = useCompanyContext();
  useAutoExchangeRateRefresh(Boolean(company));
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
