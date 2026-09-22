// ─────────────────────────────────────────────────────────────────────────────
// Payment Bridge — le vocabulaire, dit une seule fois
//
// Ce fichier n'importe RIEN et n'exporte que des types et des constantes. C'est
// délibéré : il est lu par des composants serveur, des composants client, des
// routes d'API, les services, et les tests. Une seule dépendance vers
// `next/headers` ou vers le client Supabase, et il cesse d'être importable par
// la moitié d'entre eux.
//
// Pas de `'use server'` non plus : la directive n'admet que des fonctions
// asynchrones exportées, et un seul export non conforme fait disparaître TOUS
// les exports du module (voir l'en-tête de lib/serverAuth.ts, qui a payé cette
// leçon en 62 erreurs de build).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les moyens de paiement qu'une destination peut porter.
 *
 * `moncash` et `natcash` sont les seuls que le rapprochement sait traiter :
 * l'argent arrive, un signal existe, on peut le comparer. Les autres sont
 * déclarables par le marchand et affichés comme instructions — sans
 * rapprochement automatique, parce qu'aucun signal n'arrive.
 *
 * Ce n'est PAS la même liste que `lib/storePayments.ts`. Celle-là dit ce que la
 * CAISSE de la vitrine sait traiter (`cash | moncash | natcash`) ; celle-ci dit
 * ce qu'une DESTINATION d'encaissement peut être. Les deux se recoupent sans se
 * confondre, et `store_settings.payment_methods` reste seul maître de ce que
 * l'acheteur voit.
 */
export type BridgeMethod =
  | 'moncash'
  | 'natcash'
  | 'cash'
  | 'cod'
  | 'bank_transfer'
  | 'card'
  | 'other';

/** Les moyens pour lesquels un encaissement peut être constaté puis rapproché. */
export const RECONCILABLE_METHODS: readonly BridgeMethod[] = ['moncash', 'natcash'];

export function isReconcilable(method: string): boolean {
  return (RECONCILABLE_METHODS as readonly string[]).includes(method);
}

/** L'opérateur qui a émis le signal d'encaissement. */
export type ReceiptProvider = 'moncash' | 'natcash' | 'cash' | 'bank' | 'other';

/**
 * D'où vient le signal. C'est la question la plus importante qu'on puisse poser
 * à un encaissement : elle dit ce qu'il vaut.
 *
 *   `sms_companion`         un téléphone enrôlé a lu un SMS opérateur. Fort.
 *   `provider_api`          l'opérateur lui-même. Le plus fort.
 *   `provider_webhook`      idem, poussé. Prévu, aucun opérateur ne l'offre.
 *   `manual_entry`          le marchand recopie son relevé. Il a vu l'argent.
 *   `merchant_confirmation` le marchand affirme, sans détail. Sa parole.
 */
export type ReceiptSource =
  | 'sms_companion'
  | 'manual_entry'
  | 'merchant_confirmation'
  | 'provider_api'
  | 'provider_webhook';

/**
 * Où en est la DETTE.
 *
 * Voir l'en-tête de supabase/migrations/20260927_payment_bridge.sql : le cahier
 * des charges donnait une liste plate mêlant l'état de la dette et le sort d'un
 * encaissement. Une dette de 4 500 G couverte par 4 000 G n'est pas « en
 * anomalie de montant » — elle est partiellement payée, et c'est le VERSEMENT
 * qui est en anomalie. Fondus en une colonne, ces deux récits deviennent
 * inexprimables dès qu'une dette reçoit deux versements.
 */
export type IntentStatus =
  | 'created'
  | 'awaiting_payment'
  | 'customer_reported'
  | 'under_review'
  | 'partially_paid'
  | 'confirmed'
  | 'rejected'
  | 'disputed'
  | 'expired'
  | 'cancelled';

/** Ce qu'on a fait d'un ENCAISSEMENT. */
export type MatchStatus =
  | 'pending'
  | 'auto_matched'
  | 'manually_matched'
  | 'amount_mismatch'
  | 'overpayment'
  | 'duplicate'
  | 'late'
  | 'ambiguous'
  | 'unmatched'
  | 'rejected'
  | 'resolved';

/**
 * La confiance, déterministe.
 *
 * Ce n'est pas un score appris ni une probabilité : ce sont cinq paliers que des
 * règles écrites produisent, et qu'on peut donc expliquer à un marchand qui
 * demande « pourquoi tu l'as confirmé tout seul ? ». Seul `exact` autorise une
 * confirmation sans humain.
 */
export type Confidence = 'exact' | 'high' | 'medium' | 'low' | 'none';

/** Ce que le marchand décide d'un trop-perçu ou d'un doublon. */
export type Resolution =
  | 'credit_next_invoice'
  | 'customer_credit'
  | 'refunded_manually'
  | 'resolved_manually'
  | 'ignored';

/** Ce que la dette règle. Un paiement client et un abonnement ne se mélangent pas. */
export type IntentKind = 'merchant_payment' | 'platform_subscription';

export type SessionStatus = 'open' | 'expired' | 'completed' | 'abandoned';

export type DeviceStatus = 'pending' | 'active' | 'offline' | 'revoked';

export type ActorType = 'customer' | 'merchant' | 'system' | 'device' | 'admin';

/** Par quelle voie une dette a été confirmée. La question d'un litige, six mois après. */
export type ConfirmedVia = 'auto_match' | 'merchant' | 'provider_api' | 'admin';

// ─── Les durées ──────────────────────────────────────────────────────────────

/**
 * Quinze minutes. Ce que la session dure, et RIEN d'autre.
 *
 * Passé ce délai l'écran n'est plus tenu pour actuel et une nouvelle tentative
 * peut s'ouvrir sur la même dette. Un virement effectué à 14 h 22 pour une
 * session close à 14 h 15 reste un virement : il arrive en `late`, passe en
 * examen, et le marchand le confirme. Voir `pp_expire_payment_sessions`.
 */
export const SESSION_MINUTES = 15;

/**
 * La fenêtre dans laquelle un encaissement est tenu pour contemporain de la
 * dette, aux fins du rapprochement automatique.
 *
 * Deux heures, et non quinze minutes. Un client ouvre la page, va chercher son
 * téléphone, n'a pas de réseau, ressort, revient. Le compagnon Android, lui,
 * peut avoir passé une heure hors couverture avant de pouvoir envoyer. Caler la
 * fenêtre sur la session aurait envoyé en examen manuel la majorité des
 * paiements honnêtes — et un marchand qui doit tout valider à la main n'utilise
 * plus la fonctionnalité.
 *
 * Au-delà, l'encaissement n'est pas refusé : il est proposé au marchand.
 */
export const MATCH_WINDOW_MINUTES = 120;

/**
 * La tolérance sur les montants, en gourdes.
 *
 * Un seul centime, et pour une seule raison : un nombre qui a traversé du JSON
 * peut revenir à 4499,999999999999. Ce n'est PAS une tolérance commerciale — on
 * n'accepte pas « à peu près le bon montant ». Un écart d'une gourde est un
 * écart, et il part en examen.
 */
export const AMOUNT_EPSILON = 0.01;

// ─── Les événements du journal ───────────────────────────────────────────────

/**
 * Les types d'événements écrits dans `payment_events`.
 *
 * `payment_events.event_type` est du TEXT libre en base : étendre cette union ne
 * demande aucune migration. Vérifié avant de s'y fier — contrairement à
 * `notifications.type`, qu'une migration a pu convertir en énum
 * (20260607_data_robustness.sql), et où un type inconnu ferait échouer l'insert
 * en silence.
 */
export type PaymentEventType =
  | 'payment_created'
  | 'payment_session_started'
  | 'payment_session_expired'
  | 'payment_reported'
  | 'payment_receipt_detected'
  | 'payment_auto_matched'
  | 'payment_partially_received'
  | 'payment_manually_confirmed'
  | 'payment_admin_confirmed'
  | 'payment_manually_rejected'
  | 'payment_disputed'
  | 'payment_late'
  | 'payment_amount_mismatch'
  | 'payment_overpayment'
  | 'payment_duplicate'
  | 'payment_unmatched'
  | 'payment_ambiguous'
  | 'payment_resolved'
  | 'payment_cancelled'
  | 'payment_expired'
  | 'device_registered'
  | 'device_revoked'
  | 'device_heartbeat';

// ─── Les mots que le marchand lit ────────────────────────────────────────────

/**
 * Le vocabulaire, et ce qu'il évite.
 *
 * Aucune de ces phrases ne contient « solde », « portefeuille », « disponible »,
 * « retirer » ni « déposer ». ProfitPilot ne détient pas cet argent, et un mot
 * qui suggère le contraire est une promesse qu'on ne peut pas tenir — c'est le
 * §52, et c'est aussi le §10 de la constitution visuelle : un écran ne dit pas
 * ce que le logiciel ne fait pas.
 */
export const INTENT_STATUS_LABEL: Record<IntentStatus, { fr: string; ht: string }> = {
  created:           { fr: 'À payer',              ht: 'Pou peye' },
  awaiting_payment:  { fr: 'En attente de paiement', ht: 'N ap tann peman' },
  customer_reported: { fr: 'Paiement signalé',     ht: 'Kliyan di li peye' },
  under_review:      { fr: 'À vérifier',           ht: 'Pou verifye' },
  partially_paid:    { fr: 'Partiellement payé',   ht: 'Peye an pati' },
  confirmed:         { fr: 'Paiement confirmé',    ht: 'Peman konfime' },
  rejected:          { fr: 'Paiement refusé',      ht: 'Peman refize' },
  disputed:          { fr: 'Contesté',             ht: 'Kliyan konteste' },
  expired:           { fr: 'Sans suite',           ht: 'Pa janm peye' },
  cancelled:         { fr: 'Annulé',               ht: 'Anile' },
};

export const MATCH_STATUS_LABEL: Record<MatchStatus, { fr: string; ht: string }> = {
  pending:          { fr: 'À examiner',                ht: 'Pou egzaminen' },
  auto_matched:     { fr: 'Rapproché automatiquement', ht: 'Jwenn pou kont li' },
  manually_matched: { fr: 'Rapproché par vous',        ht: 'Ou menm ki jwenn li' },
  amount_mismatch:  { fr: 'Montant inférieur',         ht: 'Mwens pase sa ki dwe' },
  overpayment:      { fr: 'Montant supérieur',         ht: 'Plis pase sa ki dwe' },
  duplicate:        { fr: 'Paiement en double',        ht: 'Peye de fwa' },
  late:             { fr: 'Paiement tardif',           ht: 'Peye an reta' },
  ambiguous:        { fr: 'Plusieurs commandes possibles', ht: 'Plizyè kòmann posib' },
  unmatched:        { fr: 'Paiement non rapproché',    ht: 'Pa jwenn ak anyen' },
  rejected:         { fr: 'Écarté',                    ht: 'Mete sou kote' },
  resolved:         { fr: 'Réglé',                     ht: 'Regle' },
};

export const METHOD_LABEL: Record<BridgeMethod, { fr: string; ht: string }> = {
  moncash:       { fr: 'MonCash',                ht: 'MonCash' },
  natcash:       { fr: 'NatCash',                ht: 'NatCash' },
  cash:          { fr: 'Espèces',                ht: 'Kach' },
  cod:           { fr: 'Paiement à la livraison', ht: 'Peye lè w resevwa' },
  bank_transfer: { fr: 'Virement bancaire',      ht: 'Vireman labank' },
  card:          { fr: 'Carte',                  ht: 'Kat' },
  other:         { fr: 'Autre',                  ht: 'Lòt' },
};
