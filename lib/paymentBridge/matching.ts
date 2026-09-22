// ─────────────────────────────────────────────────────────────────────────────
// Le moteur de rapprochement
//
// Une question : « cet argent qui vient d'arriver, quelle dette règle-t-il ? »
//
// ── Pourquoi c'est une fonction PURE ───────────────────────────────────────
//
// Elle ne lit aucune base, n'écrit rien, ne connaît pas Supabase. On lui donne
// un encaissement et la liste des dettes candidates ; elle rend une décision.
//
// Ce n'est pas une élégance : c'est la seule façon de la tester dans ce dépôt.
// Les tests ici tournent sous `node --test` sans aucune dépendance — ni vitest,
// ni jest, ni client Supabase simulé (tests/README.md explique pourquoi : le
// poste de développement a 3 Go de disque libre). Une fonction qui interroge la
// base ne se teste pas ; celle-ci se teste sur les dix scénarios du cahier des
// charges, et c'est ce que fait tests/paymentBridgeMatching.test.ts.
//
// La lecture des candidates et l'écriture de la décision vivent dans
// lib/paymentBridge/receipts.ts, qui n'a pas de logique à lui.
//
// ── Ce que « ne pas faire un simple if amount == amount » veut dire ────────
//
// Six choses, que la comparaison de montants ne voit pas :
//
//   Le TEMPS. Un virement arrivé trois jours après la commande n'est pas
//   contemporain d'elle, même au centime près.
//
//   L'AMBIGUÏTÉ. Deux commandes ouvertes à 4 500 G, un versement de 4 500 G :
//   la comparaison de montants en trouve deux, et choisir au hasard revient à
//   déclarer payée une commande que personne n'a payée.
//
//   Le DOUBLON. Une commande déjà soldée qui reçoit un second versement du même
//   montant n'est pas « non rapprochée » : elle est payée deux fois, et le
//   marchand doit décider quoi faire de l'excédent — pas nous.
//
//   Le RESTE. 4 000 reçus sur 4 500 dus, ce n'est ni un refus ni un règlement.
//
//   Le TROP-PERÇU. 5 000 reçus sur 4 500 dus non plus.
//
//   La QUALITÉ DE LA CLÉ. Un encaissement sans identifiant de transaction ne
//   peut pas garantir son unicité (voir dedupe.ts). Le confirmer tout seul
//   serait bâtir un règlement sur une clé qu'on sait faillible.
//
// ── Ce qui autorise une confirmation SANS humain ───────────────────────────
//
// Cinq conditions, toutes nécessaires. Elles sont listées dans `AUTO_CONFIRM`
// plus bas, et le reste part au marchand. Une règle déterministe qui se trompe
// coûte plus cher qu'une file d'attente : le marchand qui découvre une commande
// confirmée sans paiement cesse de faire confiance à tout le module.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AMOUNT_EPSILON,
  MATCH_WINDOW_MINUTES,
  type BridgeMethod,
  type Confidence,
  type IntentStatus,
  type MatchStatus,
  type ReceiptProvider,
} from './types';
import { normalizeTransactionReference } from './dedupe';
import { isOpen } from './states';

/**
 * Une dette, réduite à ce dont le rapprochement a besoin.
 *
 * `amountReceived` est là parce qu'une dette partiellement couverte n'attend plus
 * son montant total : elle attend son RESTE. Sans cette colonne, le second
 * versement d'un paiement en deux fois serait vu comme une anomalie de montant.
 */
export type MatchCandidate = {
  id:             string;
  reference:      string;
  method:         BridgeMethod;
  chargeAmount:   number;
  chargeCurrency: 'HTG' | 'USD';
  amountReceived: number;
  status:         IntentStatus;
  /** ISO. Le moment où la dette est née — l'ancre de la fenêtre temporelle. */
  createdAt:      string;
  /**
   * ISO. L'échéance de la session la plus récente, s'il y en a eu une. Un
   * encaissement postérieur est `late` : il ne se refuse pas, il s'examine.
   */
  sessionExpiresAt?: string | null;
  /**
   * Les références que le CLIENT a déclarées en disant « j'ai payé »
   * (`payment_evidence.declared_reference`). Recopiées à la main depuis son SMS :
   * c'est un indice fort, jamais une preuve — un chiffre recopié se trompe, et
   * un chiffre inventé existe aussi.
   */
  declaredReferences?: readonly string[];
  /** Le téléphone du client sur la commande, en chiffres. Indice secondaire. */
  customerPhoneDigits?: string | null;
  /**
   * La dette dont celle-ci est le RESTE, quand elle en est un (§15). Une dette
   * partiellement payée et sa complémentaire attendent le même montant : sans ce
   * lien, le versement du reste aurait deux candidates et tomberait en
   * « plusieurs commandes possibles ».
   */
  parentIntentId?: string | null;
};

export type IncomingReceipt = {
  provider:              ReceiptProvider;
  amount:                number;
  currency:              'HTG' | 'USD';
  transactionReference?: string | null;
  senderIdentifier?:     string | null;
  /** ISO. Quand l'opérateur dit que l'argent est arrivé. */
  receivedAt:            string;
  /**
   * D'où vient la clé de déduplication (voir dedupe.ts). `heuristic` veut dire
   * « aucun identifiant de transaction » : l'unicité n'est pas garantie, donc la
   * confirmation automatique est exclue.
   */
  dedupeBasis:           'reference' | 'heuristic';
};

export type MatchDecision = 'auto_confirm' | 'needs_review' | 'unmatched' | 'duplicate';

export type MatchOutcome = {
  decision:     MatchDecision;
  matchStatus:  MatchStatus;
  confidence:   Confidence;
  /** La dette retenue, ou `null` quand il n'y en a pas — ou qu'il y en a trop. */
  intentId:     string | null;
  /** Les dettes en concurrence, quand la décision est `ambiguous`. */
  candidateIds: string[];
  /** Le montant à imputer si l'on confirme. `null` quand un humain doit trancher. */
  applyAmount:  number | null;
  /** L'écart au reste dû : négatif s'il manque, positif s'il y a trop. */
  difference:   number | null;
  /** Une phrase pour le marchand. C'est ce que la carte de paiement affiche. */
  reason:       { fr: string; ht: string };
};

/**
 * Quels opérateurs peuvent régler quels moyens.
 *
 * Un SMS MonCash ne règle pas une commande déclarée « virement bancaire ». Cette
 * table paraît évidente jusqu'au jour où un marchand active les deux opérateurs
 * et reçoit deux versements du même montant à la même minute.
 */
const PROVIDER_METHODS: Record<ReceiptProvider, readonly BridgeMethod[]> = {
  moncash: ['moncash'],
  natcash: ['natcash'],
  cash:    ['cash', 'cod'],
  bank:    ['bank_transfer'],
  other:   ['other', 'card'],
};

function providerAccepts(provider: ReceiptProvider, method: BridgeMethod): boolean {
  return PROVIDER_METHODS[provider]?.includes(method) ?? false;
}

function minutesBetween(a: string, b: string): number {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb) / 60_000;
}

function isAfter(a: string, b: string): boolean {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return ta > tb;
}

/** Le reste réellement attendu sur cette dette. */
function remainingOf(c: MatchCandidate): number {
  return Math.max(c.chargeAmount - c.amountReceived, 0);
}

/** Le client a-t-il déclaré CETTE référence sur CETTE dette ? */
function referenceDeclared(c: MatchCandidate, receiptRef: string | null): boolean {
  if (!receiptRef) return false;
  return (c.declaredReferences ?? []).some(
    (r) => normalizeTransactionReference(r) === receiptRef,
  );
}

const money = (n: number) => `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 0 }).format(n)} HTG`;

/**
 * Les cinq conditions d'une confirmation sans humain. Nommées pour qu'on puisse
 * en retirer une sans relire tout le fichier — et pour que le journal puisse
 * dire laquelle a manqué.
 */
type AutoConfirmCheck = {
  singleCandidate: boolean;
  exactAmount:     boolean;
  withinWindow:    boolean;
  notLate:         boolean;
  trustworthyKey:  boolean;
};

const AUTO_CONFIRM = (c: AutoConfirmCheck): boolean =>
  c.singleCandidate && c.exactAmount && c.withinWindow && c.notLate && c.trustworthyKey;

/**
 * Le rapprochement.
 *
 * `candidates` doit contenir les dettes OUVERTES du commerce **et** celles
 * confirmées récemment : sans ces dernières, un second versement sur une
 * commande déjà soldée ressortirait « non rapproché » au lieu de « en double »,
 * et le marchand n'aurait aucune raison de soupçonner un doublon.
 */
export function matchReceipt(
  receipt: IncomingReceipt,
  candidates: readonly MatchCandidate[],
  opts: { now?: string } = {},
): MatchOutcome {
  const receiptRef = normalizeTransactionReference(receipt.transactionReference);

  // ── Qui peut prétendre à cet argent ────────────────────────────────────────
  //
  // L'opérateur et la devise ne se négocient pas. Un versement en gourdes ne
  // règle pas une dette libellée en dollars : c'est pour cela que
  // `payment_intents` porte `charge_amount` en plus de `amount` — le montant
  // réellement demandé, dans la devise réellement encaissée.
  const eligible = candidates.filter(
    (c) => providerAccepts(receipt.provider, c.method) && c.chargeCurrency === receipt.currency,
  );

  if (eligible.length === 0) {
    return unmatched(receipt);
  }

  // Une dette dont le reste a été reporté sur une dette complémentaire ouverte
  // n'attend plus rien elle-même : c'est la complémentaire qui porte le dû.
  const superseded = new Set(
    eligible
      .filter((c) => isOpen(c.status) && c.parentIntentId)
      .map((c) => c.parentIntentId as string),
  );
  const open    = eligible.filter((c) => isOpen(c.status) && !superseded.has(c.id));
  const settled = eligible.filter((c) => c.status === 'confirmed');

  // ── La référence déclarée par le client passe devant tout ──────────────────
  //
  // Quand le client a recopié son numéro de transaction et qu'il correspond, on
  // sait quelle dette il croyait payer. C'est plus précis qu'un montant, qui peut
  // désigner trois commandes.
  const declaredOn = open.filter((c) => referenceDeclared(c, receiptRef));
  const pool = declaredOn.length === 1 ? declaredOn : open;

  const exact = pool.filter(
    (c) => Math.abs(remainingOf(c) - receipt.amount) <= AMOUNT_EPSILON,
  );

  // ── Un seul montant exact : le cas courant, et le seul auto-confirmable ────
  if (exact.length === 1) {
    const c = exact[0];
    const late = !!c.sessionExpiresAt && isAfter(receipt.receivedAt, c.sessionExpiresAt);
    const withinWindow = minutesBetween(receipt.receivedAt, c.createdAt) <= MATCH_WINDOW_MINUTES;
    const trustworthyKey =
      receipt.dedupeBasis === 'reference' || referenceDeclared(c, receiptRef);

    const checks: AutoConfirmCheck = {
      singleCandidate: true,
      exactAmount:     true,
      withinWindow,
      notLate:         !late,
      trustworthyKey,
    };

    if (AUTO_CONFIRM(checks)) {
      return {
        decision:     'auto_confirm',
        matchStatus:  'auto_matched',
        confidence:   'exact',
        intentId:     c.id,
        candidateIds: [c.id],
        applyAmount:  receipt.amount,
        difference:   0,
        reason: {
          fr: `${money(receipt.amount)} — correspond exactement à ${c.reference}.`,
          ht: `${money(receipt.amount)} — li koresponn nèt ak ${c.reference}.`,
        },
      };
    }

    // Le montant est bon, mais quelque chose d'autre ne l'est pas. On propose au
    // marchand plutôt que de deviner — et on lui dit QUOI, sinon il ne peut pas
    // décider mieux que nous.
    return {
      decision:     'needs_review',
      matchStatus:  late ? 'late' : 'pending',
      confidence:   'high',
      intentId:     c.id,
      candidateIds: [c.id],
      applyAmount:  null,
      difference:   0,
      reason: late
        ? {
            fr: `${money(receipt.amount)} — le bon montant pour ${c.reference}, mais reçu après l'expiration du délai.`,
            ht: `${money(receipt.amount)} — bon montan pou ${c.reference}, men li rive apre lè a fin pase.`,
          }
        : !withinWindow
        ? {
            fr: `${money(receipt.amount)} — le bon montant pour ${c.reference}, mais reçu bien après la commande.`,
            ht: `${money(receipt.amount)} — bon montan pou ${c.reference}, men li rive lontan apre kòmann nan.`,
          }
        : {
            fr: `${money(receipt.amount)} — le bon montant pour ${c.reference}, sans numéro de transaction pour le confirmer.`,
            ht: `${money(receipt.amount)} — bon montan pou ${c.reference}, men pa gen nimewo tranzaksyon pou konfime l.`,
          },
    };
  }

  // ── Plusieurs montants exacts : personne ne peut choisir à la place du marchand
  if (exact.length > 1) {
    return {
      decision:     'needs_review',
      matchStatus:  'ambiguous',
      confidence:   'low',
      intentId:     null,
      candidateIds: exact.map((c) => c.id),
      applyAmount:  null,
      difference:   0,
      reason: {
        fr: `${money(receipt.amount)} — ${exact.length} commandes attendent ce montant. Indiquez laquelle.`,
        ht: `${money(receipt.amount)} — ${exact.length} kòmann ap tann montan sa a. Di kilès.`,
      },
    };
  }

  // ── Une dette DÉJÀ soldée attendait exactement ce montant ─────────────────
  //
  // Placé avant les écarts de montant : entre « doublon sur une commande soldée »
  // et « il manque 500 sur une autre », la première lecture est la bonne. Un
  // client qui paie deux fois le fait du même montant.
  const duplicateOf = settled.find(
    (c) => Math.abs(c.chargeAmount - receipt.amount) <= AMOUNT_EPSILON,
  );
  if (duplicateOf) {
    return {
      decision:     'duplicate',
      matchStatus:  'duplicate',
      confidence:   'high',
      intentId:     null,
      candidateIds: [duplicateOf.id],
      applyAmount:  null,
      difference:   0,
      reason: {
        fr: `${money(receipt.amount)} — ${duplicateOf.reference} est déjà payée. Ce versement est en double.`,
        ht: `${money(receipt.amount)} — ${duplicateOf.reference} gen tan peye. Sa a se yon dezyèm fwa.`,
      },
    };
  }

  // ── Écart de montant sur une dette unique ────────────────────────────────
  if (pool.length === 1) {
    const c = pool[0];
    const remaining = remainingOf(c);
    const diff = receipt.amount - remaining;
    const over = diff > 0;

    return {
      decision:     'needs_review',
      matchStatus:  over ? 'overpayment' : 'amount_mismatch',
      confidence:   'medium',
      intentId:     c.id,
      candidateIds: [c.id],
      // Rien n'est imputé sans décision : un versement court ouvre une dette
      // complémentaire, un trop-perçu appelle un choix. Les deux appartiennent
      // au marchand (§15, §16).
      applyAmount:  null,
      difference:   diff,
      reason: over
        ? {
            fr: `${money(receipt.amount)} reçus pour ${money(remaining)} attendus sur ${c.reference} — ${money(diff)} en trop.`,
            ht: `${money(receipt.amount)} rive pou ${money(remaining)} ki te dwe sou ${c.reference} — ${money(diff)} anplis.`,
          }
        : {
            fr: `${money(receipt.amount)} reçus pour ${money(remaining)} attendus sur ${c.reference} — il manque ${money(-diff)}.`,
            ht: `${money(receipt.amount)} rive pou ${money(remaining)} ki te dwe sou ${c.reference} — ${money(-diff)} ki manke.`,
          },
    };
  }

  // ── Plusieurs dettes ouvertes, aucune au bon montant ────────────────────
  if (pool.length > 1) {
    return {
      decision:     'needs_review',
      matchStatus:  'ambiguous',
      confidence:   'low',
      intentId:     null,
      candidateIds: pool.map((c) => c.id),
      applyAmount:  null,
      difference:   null,
      reason: {
        fr: `${money(receipt.amount)} — aucune commande n'attend ce montant exact. Choisissez celle que ce paiement règle.`,
        ht: `${money(receipt.amount)} — pa gen kòmann k ap tann montan egzak sa a. Chwazi kilès li peye.`,
      },
    };
  }

  return unmatched(receipt);
}

/**
 * Aucune dette ne correspond.
 *
 * Ce n'est pas une erreur, et surtout pas un motif de rejet : l'argent EST
 * arrivé. Le marchand a peut-être été payé pour une vente au comptoir, ou pour
 * une commande passée par WhatsApp, ou par un client qui règle une ardoise. Il
 * doit le voir, et pouvoir le rattacher lui-même (§17).
 */
function unmatched(receipt: IncomingReceipt): MatchOutcome {
  return {
    decision:     'unmatched',
    matchStatus:  'unmatched',
    confidence:   'none',
    intentId:     null,
    candidateIds: [],
    applyAmount:  null,
    difference:   null,
    reason: {
      fr: `${money(receipt.amount)} reçus — aucune commande en attente ne correspond.`,
      ht: `${money(receipt.amount)} rive — pa gen kòmann k ap tann ki koresponn.`,
    },
  };
}
