// ─────────────────────────────────────────────────────────────────────────────
// La boîte de réception des paiements — qui va où, et avec quels boutons
//
// ── Pourquoi une fonction pure ─────────────────────────────────────────────
//
// Ranger une carte dans « À vérifier » plutôt que « Problèmes » décide de ce que
// le marchand regarde en premier le matin. Une règle fausse ici, et un doublon
// de 4 500 G dort dans « Tous » pendant que la file « À vérifier » paraît vide.
// Écrite dans le composant, cette règle ne se testerait pas ; ici, elle se teste
// (tests/paymentBridgeInbox.test.ts).
//
// ── Une carte par décision, pas une carte par ligne ────────────────────────
//
// Un encaissement détecté qui vise une dette précise (« le bon montant, mais
// après l'expiration ») et cette dette sont DEUX lignes en base, mais UNE seule
// question pour le marchand : « je confirme ? ». Les afficher en deux cartes lui
// ferait confirmer l'une, puis se demander quoi faire de l'autre. Elles sont donc
// fusionnées : la dette porte l'encaissement qui l'attend.
//
// Un encaissement qui ne vise AUCUNE dette unique — non rapproché, ambigu, en
// double, trop-perçu — a sa propre carte : la décision porte sur lui.
//
// Ce fichier n'importe que des types et des fonctions pures.
// ─────────────────────────────────────────────────────────────────────────────

import { maskPhone, maskReference } from './mask';
import {
  INTENT_STATUS_LABEL,
  MATCH_STATUS_LABEL,
  METHOD_LABEL,
  type BridgeMethod,
  type IntentStatus,
  type MatchStatus,
  type ReceiptProvider,
  type ReceiptSource,
} from './types';

// ─── Ce que la base fournit ─────────────────────────────────────────────────

export type InboxIntentRow = {
  id:              string;
  reference:       string;
  status:          IntentStatus;
  method:          BridgeMethod;
  chargeAmount:    number;
  chargeCurrency:  string;
  amountReceived:  number;
  createdAt:       string;
  confirmedAt:     string | null;
  parentIntentId:  string | null;
  parentReference: string | null;
  orderId:         string | null;
  orderNumber:     string | null;
  customerName:    string | null;
  /** La dernière déclaration du client, s'il a dit « j'ai payé ». */
  declared:        { amount: number | null; reference: string | null; at: string } | null;
};

export type InboxReceiptRow = {
  id:                   string;
  intentId:             string | null;
  provider:             ReceiptProvider;
  source:               ReceiptSource;
  amount:               number;
  currency:             string;
  transactionReference: string | null;
  senderIdentifier:     string | null;
  receivedAt:           string;
  matchStatus:          MatchStatus;
  /** NULL = jamais imputé à une dette. Voir la migration, `applied_amount`. */
  appliedAmount:        number | null;
  resolution:           string | null;
  deviceName:           string | null;
  reason:               string | null;
  candidateIds:         string[];
};

// ─── Ce que l'écran affiche ─────────────────────────────────────────────────

/** Les quatre onglets du §30, plus les deux rangements qui ne sont que dans « Tous ». */
export type InboxTab = 'review' | 'confirmed' | 'problems' | 'waiting' | 'closed';

export type InboxAction =
  | 'confirm'         // imputer l'encaissement joint à cette dette
  | 'confirm_manual'  // « j'ai vu l'argent » — aucun encaissement détecté
  | 'reject'          // le client dit avoir payé, rien n'est arrivé
  | 'cancel'          // la commande ne se fera pas
  | 'link'            // rattacher cet encaissement à une commande
  | 'resolve'         // décider d'un doublon ou d'un trop-perçu
  | 'ignore';         // écarter un encaissement sans rapport

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export type InboxCard = {
  key:          string;
  kind:         'intent' | 'receipt';
  tab:          InboxTab;
  intentId:     string | null;
  receiptId:    string | null;
  /** Le montant en tête de carte : reçu s'il y en a un, attendu sinon. */
  amount:       number;
  currency:     string;
  /** Le montant attendu, affiché sous le montant reçu quand ils diffèrent. */
  expected:     number | null;
  methodLabel:  string;
  reference:    string | null;
  orderId:      string | null;
  orderNumber:  string | null;
  customerName: string | null;
  at:           string;
  /** La pastille : « Paiement détecté », « Paiement signalé »… */
  headline:     string;
  tone:         Tone;
  /** La phrase qui explique, quand il y a quelque chose à expliquer. */
  reason:       string | null;
  /** Identifiant de transaction, masqué (mask.ts). */
  transaction:  string | null;
  sender:       string | null;
  source:       ReceiptSource | null;
  deviceName:   string | null;
  candidateIds: string[];
  actions:      InboxAction[];
};

const OPEN: readonly IntentStatus[] = [
  'created', 'awaiting_payment', 'customer_reported', 'under_review', 'partially_paid', 'disputed',
];

/** Les verdicts qui attendent une décision sur un encaissement. */
const UNDECIDED: readonly MatchStatus[] = ['pending', 'late', 'ambiguous', 'amount_mismatch', 'overpayment'];

const PROVIDER_LABEL: Record<ReceiptProvider, string> = {
  moncash: 'MonCash',
  natcash: 'NatCash',
  cash:    'Espèces',
  bank:    'Virement bancaire',
  other:   'Autre',
};

/**
 * Ranger et décorer.
 *
 * L'ordre rendu est celui du plus récent au plus ancien ; les onglets filtrent
 * sans retrier.
 */
export function buildInbox(
  intents: readonly InboxIntentRow[],
  receipts: readonly InboxReceiptRow[],
): InboxCard[] {
  const intentById = new Map(intents.map((i) => [i.id, i]));

  // Une dette dont le reste a été reporté sur une complémentaire OUVERTE ne
  // demande plus rien : la carte de la complémentaire porte la question.
  const superseded = new Set(
    intents
      .filter((i) => i.parentIntentId && OPEN.includes(i.status))
      .map((i) => i.parentIntentId as string),
  );

  // L'encaissement en attente de décision qui vise UNE dette précise, par dette.
  // Le plus récent gagne : c'est lui que le marchand a sous les yeux.
  const pendingFor = new Map<string, InboxReceiptRow>();
  for (const r of receipts) {
    if (!r.intentId || r.appliedAmount != null) continue;
    if (!UNDECIDED.includes(r.matchStatus)) continue;
    if (!intentById.has(r.intentId)) continue;
    const prev = pendingFor.get(r.intentId);
    if (!prev || Date.parse(r.receivedAt) > Date.parse(prev.receivedAt)) pendingFor.set(r.intentId, r);
  }
  const merged = new Set([...pendingFor.values()].map((r) => r.id));

  const cards: InboxCard[] = [];

  for (const i of intents) {
    if (superseded.has(i.id)) continue;
    cards.push(intentCard(i, pendingFor.get(i.id) ?? null));
  }

  for (const r of receipts) {
    if (merged.has(r.id)) continue;
    const card = receiptCard(r, r.intentId ? intentById.get(r.intentId) ?? null : null);
    if (card) cards.push(card);
  }

  return cards.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

function intentCard(i: InboxIntentRow, pending: InboxReceiptRow | null): InboxCard {
  const remaining = Math.max(i.chargeAmount - i.amountReceived, 0);
  const base = {
    key:          `i:${i.id}`,
    kind:         'intent' as const,
    intentId:     i.id,
    receiptId:    pending?.id ?? null,
    currency:     i.chargeCurrency,
    methodLabel:  METHOD_LABEL[i.method]?.fr ?? i.method,
    reference:    i.reference,
    orderId:      i.orderId,
    orderNumber:  i.orderNumber,
    customerName: i.customerName,
    transaction:  pending ? maskReference(pending.transactionReference) || null : null,
    sender:       pending ? maskPhone(pending.senderIdentifier) || null : null,
    source:       pending?.source ?? null,
    deviceName:   pending?.deviceName ?? null,
    candidateIds: [] as string[],
  };

  // ── Un encaissement attend cette dette ──────────────────────────────────
  if (pending && OPEN.includes(i.status)) {
    const problem = pending.matchStatus === 'amount_mismatch' || pending.matchStatus === 'overpayment';
    return {
      ...base,
      tab:      problem ? 'problems' : 'review',
      amount:   pending.amount,
      expected: Math.abs(pending.amount - remaining) > 0.01 ? remaining : null,
      at:       pending.receivedAt,
      headline: problem ? MATCH_STATUS_LABEL[pending.matchStatus].fr : 'Paiement détecté',
      tone:     problem ? 'warning' : 'info',
      reason:   pending.reason,
      actions:  ['confirm', ...rejectOrCancel(i.status)],
    };
  }

  const reported = !!i.declared;
  const suffix = i.parentReference ? ` — reste de ${i.parentReference}` : '';

  switch (i.status) {
    case 'confirmed':
      return {
        ...base, tab: 'confirmed',
        amount: i.amountReceived || i.chargeAmount, expected: null,
        at: i.confirmedAt ?? i.createdAt,
        headline: 'Paiement confirmé', tone: 'success', reason: null, actions: [],
      };

    case 'rejected':
    case 'cancelled':
    case 'expired':
      return {
        ...base, tab: 'closed',
        amount: i.chargeAmount, expected: null, at: i.createdAt,
        headline: INTENT_STATUS_LABEL[i.status].fr, tone: 'neutral', reason: null, actions: [],
      };

    case 'partially_paid':
      return {
        ...base, tab: 'problems',
        amount: i.amountReceived, expected: i.chargeAmount, at: i.createdAt,
        headline: 'Partiellement payé', tone: 'warning',
        reason: `Il reste ${fmt(remaining, i.chargeCurrency)} à recevoir.`,
        actions: ['confirm_manual', 'cancel'],
      };

    case 'customer_reported':
    case 'under_review':
    case 'disputed':
      return {
        ...base, tab: 'review',
        amount: i.declared?.amount ?? remaining,
        expected: i.declared?.amount != null && Math.abs(i.declared.amount - remaining) > 0.01
          ? remaining : null,
        at: i.declared?.at ?? i.createdAt,
        headline: i.status === 'disputed' ? 'Contesté par le client'
          : reported ? 'Paiement signalé par le client' : 'À vérifier',
        tone: i.status === 'disputed' ? 'danger' : 'warning',
        // Dit sans détour : c'est une DÉCLARATION. Le marchand vérifie sur son
        // téléphone avant de confirmer — la capture d'écran n'est pas l'argent.
        reason: reported
          ? `Le client dit avoir payé${i.declared?.reference ? ` (transaction ${maskReference(i.declared.reference)})` : ''}. Vérifiez sur votre téléphone avant de confirmer.${suffix}`
          : (suffix ? suffix.slice(3) : null),
        actions: ['confirm_manual', ...rejectOrCancel(i.status)],
      };

    default: // created, awaiting_payment
      return {
        ...base, tab: 'waiting',
        amount: remaining, expected: null, at: i.createdAt,
        headline: 'En attente de paiement', tone: 'neutral',
        reason: suffix ? `Reste à payer${suffix}.` : null,
        actions: ['confirm_manual', 'cancel'],
      };
  }
}

function receiptCard(r: InboxReceiptRow, intent: InboxIntentRow | null): InboxCard | null {
  // Un encaissement imputé est raconté par la carte de sa dette — sauf le
  // trop-perçu, dont l'excédent attend encore une décision.
  if (r.appliedAmount != null && !(r.matchStatus === 'overpayment' && !r.resolution)) return null;
  if (r.matchStatus === 'auto_matched' || r.matchStatus === 'manually_matched') return null;

  const base = {
    key:          `r:${r.id}`,
    kind:         'receipt' as const,
    intentId:     r.intentId,
    receiptId:    r.id,
    amount:       r.amount,
    currency:     r.currency,
    expected:     null,
    methodLabel:  PROVIDER_LABEL[r.provider] ?? r.provider,
    reference:    intent?.reference ?? null,
    orderId:      intent?.orderId ?? null,
    orderNumber:  intent?.orderNumber ?? null,
    customerName: intent?.customerName ?? null,
    at:           r.receivedAt,
    transaction:  maskReference(r.transactionReference) || null,
    sender:       maskPhone(r.senderIdentifier) || null,
    source:       r.source,
    deviceName:   r.deviceName,
    candidateIds: r.candidateIds,
    reason:       r.reason,
  };

  switch (r.matchStatus) {
    case 'unmatched':
      return { ...base, tab: 'problems', headline: 'Paiement non rapproché', tone: 'danger',
               reason: r.reason ?? 'Paiement détecté mais aucune commande correspondante.',
               actions: ['link', 'ignore'] };
    case 'duplicate':
      return { ...base, tab: 'problems', headline: 'Paiement en double', tone: 'danger',
               actions: ['resolve', 'link'] };
    case 'overpayment':
      return { ...base, tab: 'problems', headline: 'Montant supérieur', tone: 'warning',
               actions: r.appliedAmount != null ? ['resolve'] : ['link', 'resolve'] };
    case 'ambiguous':
      return { ...base, tab: 'review', headline: 'Plusieurs commandes possibles', tone: 'warning',
               actions: ['link', 'ignore'] };
    case 'pending':
    case 'late':
    case 'amount_mismatch':
      return { ...base, tab: r.matchStatus === 'amount_mismatch' ? 'problems' : 'review',
               headline: MATCH_STATUS_LABEL[r.matchStatus].fr, tone: 'warning',
               actions: ['link', 'ignore'] };
    case 'resolved':
    case 'rejected':
      return { ...base, tab: 'closed', headline: MATCH_STATUS_LABEL[r.matchStatus].fr,
               tone: 'neutral', actions: [] };
    default:
      return null;
  }
}

/** Refuser n'a de sens que si le client a affirmé quelque chose ; sinon, annuler. */
function rejectOrCancel(status: IntentStatus): InboxAction[] {
  return status === 'customer_reported' || status === 'under_review' || status === 'disputed'
    ? ['reject']
    : ['cancel'];
}

/** Les onglets du §30. « Tous » ne filtre rien. */
export function cardsForTab(cards: readonly InboxCard[], tab: 'review' | 'confirmed' | 'problems' | 'all'): InboxCard[] {
  return tab === 'all' ? cards.slice() : cards.filter((c) => c.tab === tab);
}

// ─── Les chiffres du jour ───────────────────────────────────────────────────

export type BridgeStats = {
  /** Paiements confirmés aujourd'hui. */
  todayCount:    number;
  /** Ce qu'ils ont apporté, en gourdes. PAS un solde : un total de constats. */
  todayReceived: number;
  toReview:      number;
  unmatched:     number;
  late:          number;
  amountIssues:  number;
};

/**
 * Le jour, en heure d'Haïti. Un paiement de 21 h le 27 à Port-au-Prince est le
 * 28 en UTC : compter en UTC le rangerait dans la journée du lendemain.
 */
export function haitiDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Port-au-Prince', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export function computeStats(
  cards: readonly InboxCard[],
  receipts: readonly InboxReceiptRow[],
  nowIso: string,
): BridgeStats {
  const today = haitiDay(nowIso);

  // Ce qui a été IMPUTÉ aujourd'hui, compté une fois par encaissement. Compter
  // les dettes confirmées aurait compté deux fois une commande payée en deux
  // versements, et oublié le premier versement d'une dette pas encore soldée.
  const applied = receipts.filter(
    (r) => r.appliedAmount != null && r.currency === 'HTG' && haitiDay(r.receivedAt) === today,
  );

  return {
    todayCount:    cards.filter((c) => c.tab === 'confirmed' && haitiDay(c.at) === today).length,
    todayReceived: applied.reduce((s, r) => s + (r.appliedAmount ?? 0), 0),
    toReview:      cards.filter((c) => c.tab === 'review').length,
    unmatched:     cards.filter((c) => c.kind === 'receipt' && c.headline === 'Paiement non rapproché').length,
    late:          receipts.filter((r) => r.matchStatus === 'late' && r.appliedAmount == null).length,
    amountIssues:  cards.filter((c) => c.tab === 'problems' && c.headline !== 'Paiement non rapproché').length,
  };
}

function fmt(n: number, currency: string): string {
  return `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(n)} ${currency}`;
}
