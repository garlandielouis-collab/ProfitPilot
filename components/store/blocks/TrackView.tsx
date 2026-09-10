'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La mesure de l'entonnoir (§30)
//
// Ce qui est mesuré : une visite, une fiche produit ouverte, un ajout au
// panier, un checkout entamé, un achat. Cinq nombres, ceux du §30, et rien
// d'autre.
//
// Ce qui n'est PAS mesuré : qui vous êtes. `session_id` est un identifiant
// aléatoire posé dans `sessionStorage` — il meurt à la fermeture de l'onglet,
// ne traverse aucun autre site, et n'est rattaché à aucune personne. Aucun
// cookie, aucun script tiers, aucune bannière de consentement à afficher.
//
// L'envoi est « au mieux » : `keepalive` pour survivre à une navigation, et une
// erreur avalée. Une boutique ne casse pas parce qu'un compteur n'a pas pu être
// incrémenté — et sur une connexion mobile haïtienne, il n'y arrivera pas
// toujours.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';

const KEY = 'pp_store_session';

/** L'identifiant d'onglet. Créé au premier appel, oublié à la fermeture. */
export function storeSessionId(): string {
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Navigation privée, stockage bloqué : on mesure quand même la visite, on
    // ne la relie simplement à rien.
    return 'anonymous';
  }
}

export type StoreEvent =
  | 'page_view'
  | 'product_view'
  | 'add_to_cart'
  | 'checkout_started'
  | 'whatsapp_click';

export function trackStoreEvent(input: {
  businessId: string;
  event:      StoreEvent;
  productId?: string | null;
  value?:     number | null;
  path?:      string | null;
}): void {
  try {
    const body = JSON.stringify({
      businessId: input.businessId,
      sessionId:  storeSessionId(),
      event:      input.event,
      productId:  input.productId ?? null,
      value:      input.value ?? null,
      path:       input.path ?? window.location.pathname,
      // L'HÔTE du référent seulement. Une URL complète porte parfois un
      // identifiant de campagne, parfois un nom.
      referrer:   document.referrer ? new URL(document.referrer).hostname : null,
    });

    void fetch('/api/store/track', {
      method:    'POST',
      headers:   { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Rien. Un compteur n'a jamais fait vendre.
  }
}

/**
 * Le composant qui déclenche l'événement d'affichage.
 *
 * `useRef` plutôt qu'un tableau de dépendances vide : en mode strict, React
 * monte deux fois en développement, et sans ce garde chaque page compterait
 * deux visites — le marchand verrait son taux de conversion divisé par deux
 * sans comprendre pourquoi.
 */
export function TrackView({ businessId, event, productId, path }: {
  businessId: string;
  event:      StoreEvent;
  productId?: string;
  path?:      string;
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackStoreEvent({ businessId, event, productId, path });
  }, [businessId, event, productId, path]);

  return null;
}
