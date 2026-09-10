'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Ce qui appartient à l'application, et pas à la vitrine
//
// Le layout racine enveloppe TOUT, y compris les boutiques des marchands. Des
// composants pensés pour l'écran d'un commerçant connecté — file de ventes hors
// ligne, rafraîchissement de taux, service worker — se montaient donc aussi
// chez son client, qui n'a pas de compte et n'a rien demandé.
//
// Sur une connexion irrégulière, ce sont des requêtes en moins et des erreurs
// en moins dans la console de l'acheteur. Sur le fond, c'est la frontière que
// la vitrine doit avoir : elle est le site du marchand, pas une page de
// ProfitPilot.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export function AppOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // `/apercu` rend une vitrine, avec les mêmes conséquences : le marchand y
  // juge sa boutique, et une file de ventes hors ligne ou une bulle d'aide
  // posée par-dessus ne fait pas partie de ce qu'il regarde.
  if (pathname?.startsWith('/store/') || pathname?.startsWith('/apercu')) return null;
  return <>{children}</>;
}
