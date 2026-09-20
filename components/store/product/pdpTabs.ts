'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Ouvrir un onglet depuis la colonne d'achat
//
// « Guide des tailles » et « Voir la composition » sont des questions qu'on se
// pose LE DOIGT SUR LE BOUTON, pas six écrans plus bas. La colonne les pose
// donc là où la décision se prend — mais la réponse, elle, vit déjà dans un
// onglet (`ProductTabs`), avec les vraies lignes saisies par le marchand.
//
// La recopier dans la colonne ferait deux rendus de la même donnée, donc deux
// occasions de diverger. Un évènement suffit : la colonne demande, les onglets
// ouvrent le bon panneau et s'amènent sous les yeux.
//
// ── Pourquoi un évènement plutôt qu'un contexte ────────────────────────────
//
// Un contexte obligerait la fiche à porter l'état des onglets pour le prêter à
// la colonne, c'est-à-dire à remonter dans `ProductDetailClient` un état qui
// n'intéresse qu'un seul composant. L'évènement ne traverse rien : il part
// d'un clic et meurt dans l'écouteur.
//
// Un onglet dont la source est vide n'est pas rendu — l'évènement ne trouve
// alors personne, et il ne se passe rien. C'est pour cela que le bouton qui
// l'émet ne s'affiche que si la donnée existe : il ne promet jamais un panneau
// qui n'existe pas.
// ─────────────────────────────────────────────────────────────────────────────

import type { PdpTabKey } from '../../../lib/storeProductPage';

export const PDP_TAB_EVENT = 'pp:pdp-open-tab';

export function openPdpTab(key: PdpTabKey): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PdpTabKey>(PDP_TAB_EVENT, { detail: key }));
}
