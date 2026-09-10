'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Le service worker de l'application.
 *
 * Il ne s'installe PAS depuis une vitrine. Deux raisons, et la première suffit :
 *
 *   Le client d'un marchand n'installe pas notre application. Un service worker
 *   enregistré depuis sa boutique met en cache des ressources qui ne le
 *   concernent pas, sur son téléphone, sans qu'il l'ait demandé.
 *
 *   L'enregistrement échouait de toute façon depuis la vitrine — « the script
 *   resource is behind a redirect, which is disallowed » : le middleware réécrit
 *   les requêtes de l'hôte de la boutique, et un service worker refuse un script
 *   servi derrière une redirection. C'était donc une erreur dans la console de
 *   chaque acheteur, pour un enregistrement qui n'aboutissait jamais.
 */
export function RegisterSW() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith('/store/')) return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, [pathname]);

  return null;
}
