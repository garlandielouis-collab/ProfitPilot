// ─────────────────────────────────────────────────────────────────────────────
// La machine d'états d'un paiement
//
// ── Pourquoi une table, et pas des `if` dispersés ───────────────────────────
//
// Sans elle, chaque écran et chaque route décide seul de ce qu'il a le droit
// d'écrire. Le résultat se lit déjà ailleurs dans ce dépôt : `updateOrderStatus`
// (app/actions/boutique.ts) accepte n'importe quelle chaîne comme statut de
// commande, et rien côté application ne l'en empêche — seule la contrainte CHECK
// de la base arrête une valeur absurde, et elle ne sait rien de l'ORDRE des
// états. Un « confirmed » posé sur une commande annulée y passerait.
//
// Ici, une seule table dit ce qui suit quoi. Tout le reste la consulte.
//
// ── Ce que cette table NE protège PAS ──────────────────────────────────────
//
// Elle valide un ENCHAÎNEMENT, pas une concurrence. Deux appels simultanés
// consultent tous les deux la même table et passent tous les deux. Ce qui les
// sérialise est ailleurs, et doit y rester :
//
//   le `FOR UPDATE` de `pp_confirm_payment_intent`, pour la confirmation ;
//   le `.eq('status', attendu)` des mises à jour de l'application, qui échoue à
//   zéro ligne quand un autre appel est passé avant — le verrou optimiste.
//
// C'est pour cela que `confirmed` n'est atteignable QUE par la fonction SQL, et
// n'apparaît dans aucune transition autorisée ici : personne d'autre ne doit
// pouvoir l'écrire (§18).
// ─────────────────────────────────────────────────────────────────────────────

import type { IntentStatus } from './types';

/**
 * Ce qu'un état permet d'atteindre.
 *
 * `confirmed` est ABSENT de toutes les listes, volontairement : il n'est pas
 * atteint par une transition applicative mais par `pp_confirm_payment_intent`,
 * qui verrouille la ligne, vérifie que l'encaissement n'a pas déjà servi et
 * règle la commande dans la même transaction. Le passer ici l'aurait rendu
 * écrivable par un simple UPDATE.
 *
 * Les états terminaux ont une liste vide — sauf `rejected`, qu'un client peut
 * contester (`disputed`), et `expired`, qu'une nouvelle tentative rouvre : une
 * dette n'est pas éteinte parce que personne ne l'a payée dans le quart d'heure.
 */
const ALLOWED: Record<IntentStatus, readonly IntentStatus[]> = {
  created: ['awaiting_payment', 'customer_reported', 'under_review', 'cancelled', 'expired'],

  awaiting_payment: ['customer_reported', 'under_review', 'partially_paid', 'expired', 'cancelled'],

  // Le client a dit « j'ai payé ». Cela ouvre un examen, jamais un règlement.
  customer_reported: ['under_review', 'partially_paid', 'rejected', 'cancelled'],

  under_review: ['partially_paid', 'rejected', 'disputed', 'cancelled'],

  // Une dette partiellement couverte peut encore recevoir, être examinée, ou
  // être abandonnée par le marchand qui préfère solder autrement. Elle ne
  // repasse PAS en `awaiting_payment` : l'argent déjà reçu ne se dés-reçoit pas.
  partially_paid: ['under_review', 'disputed', 'cancelled'],

  // Terminal. Un paiement confirmé ne se défait pas en changeant un statut : le
  // geste existe (remboursement, annulation de vente) et il laisse ses propres
  // traces, ailleurs.
  confirmed: [],

  // Un refus se conteste. C'est le seul recours du client, et le lui retirer
  // ferait du marchand un juge sans appel sur son propre argent.
  rejected: ['disputed'],

  disputed: ['under_review', 'rejected', 'cancelled'],

  // Sans suite, mais pas éteinte : ouvrir une nouvelle session la ramène en
  // attente (`pp_open_payment_session`).
  expired: ['awaiting_payment', 'customer_reported', 'under_review', 'cancelled'],

  cancelled: [],
};

/** Les états depuis lesquels plus rien ne part. */
export const TERMINAL_STATUSES: readonly IntentStatus[] = ['confirmed', 'cancelled'];

export function isTerminal(status: IntentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Les états dans lesquels une dette est encore à encaisser — ceux que le
 * rapprochement considère comme candidats.
 *
 * `confirmed` n'en fait pas partie, mais le moteur le reçoit quand même pour
 * pouvoir reconnaître un DOUBLON : un second virement du même montant sur une
 * commande déjà soldée n'est pas « non rapproché », il est en double (§14).
 */
export const OPEN_STATUSES: readonly IntentStatus[] = [
  'created',
  'awaiting_payment',
  'customer_reported',
  'under_review',
  'partially_paid',
];

export function isOpen(status: IntentStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** Le passage de `from` à `to` est-il autorisé ? */
export function canTransition(from: IntentStatus, to: IntentStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export type TransitionCheck =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Le refus, écrit pour être lu.
 *
 * Le message part vers un marchand à travers `UserFacingError` : il doit nommer
 * les deux états en français, pas en jargon d'énum. « Un paiement confirmé ne
 * peut plus changer d'état » se comprend ; « transition confirmed→rejected
 * invalide » ne se comprend pas.
 *
 * Un passage d'un état vers LUI-MÊME est accepté sans rien faire : c'est le
 * double clic, la requête rejouée, l'onglet resté ouvert. Le refuser ferait
 * échouer des gestes inoffensifs.
 */
export function assertTransition(from: IntentStatus, to: IntentStatus): TransitionCheck {
  if (from === to) return { ok: true };

  if (to === 'confirmed') {
    return {
      ok: false,
      reason: 'Un paiement ne se confirme que par le rapprochement : cette voie ne le permet pas.',
    };
  }

  if (isTerminal(from)) {
    return {
      ok: false,
      reason: from === 'confirmed'
        ? "Ce paiement est confirmé : son état ne change plus. Pour revenir dessus, passez par un remboursement."
        : "Ce paiement est annulé : son état ne change plus.",
    };
  }

  if (!canTransition(from, to)) {
    return {
      ok: false,
      reason: `Ce paiement ne peut pas passer de « ${LABEL[from]} » à « ${LABEL[to]} ».`,
    };
  }

  return { ok: true };
}

/**
 * Les mêmes mots que `INTENT_STATUS_LABEL`, en français seulement.
 *
 * Recopiés ici plutôt qu'importés : `assertTransition` est appelée depuis des
 * chemins serveur qui n'ont pas de langue choisie — un message d'erreur figé
 * côté serveur ne peut pas être traduit après coup (c'est pour cela que
 * `unconvertedNotice` de lib/currency.ts rend une PAIRE fr/ht, et pas une
 * phrase). Ces refus-là sont des garde-fous techniques que le marchand ne
 * déclenche qu'en cas de course : le français suffit, et l'écran a son propre
 * repli via `screenMessage`.
 */
const LABEL: Record<IntentStatus, string> = {
  created:           'À payer',
  awaiting_payment:  'En attente de paiement',
  customer_reported: 'Paiement signalé',
  under_review:      'À vérifier',
  partially_paid:    'Partiellement payé',
  confirmed:         'Paiement confirmé',
  rejected:          'Paiement refusé',
  disputed:          'Contesté',
  expired:           'Sans suite',
  cancelled:         'Annulé',
};
