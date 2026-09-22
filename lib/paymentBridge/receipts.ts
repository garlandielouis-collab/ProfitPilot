// ─────────────────────────────────────────────────────────────────────────────
// Encaisser un signal, le rapprocher, et n'en tirer qu'une seule conclusion
//
// Ce fichier est délibérément SANS logique de décision. Il lit, il appelle
// `matchReceipt`, il écrit ce que la décision dit. Tout ce qui « juge » vit dans
// matching.ts, qui est pur et donc testé sur les dix scénarios du cahier des
// charges. Une règle écrite ici serait une règle non testée.
//
// ── L'ordre des opérations, et pourquoi il n'est pas interchangeable ────────
//
//   1. calculer la clé de déduplication       (serveur, jamais le client)
//   2. INSÉRER le reçu                        ← l'idempotence est jouée ICI
//   3. lire les dettes candidates
//   4. décider                                 (matching.ts)
//   5. appliquer
//
// L'insertion précède la lecture des candidates, et c'est tout le sujet. Un
// `SELECT` de contrôle avant l'insertion ne protège de rien : deux envois
// simultanés du même SMS lisent tous les deux « pas encore là ». Seul l'index
// unique `(business_id, dedupe_key)` sérialise, et il ne parle qu'au moment de
// l'INSERT. Un doublon s'y présente comme une erreur 23505 — qu'on traite comme
// un SUCCÈS, parce que « je le connais déjà » est la bonne réponse.
//
// ── Ce qui empêche une maquette de confirmer une commande ───────────────────
//
// `PARSERS_ARE_MOCK`. Aucun analyseur de SMS n'a encore été confronté à un vrai
// message MonCash. Tant que c'est vrai, un encaissement d'origine
// `sms_companion` ne peut PAS déclencher de confirmation automatique, même si le
// montant tombe au centime : le montant lu par une règle non éprouvée n'est pas
// un montant constaté. Le marchand le voit, le marchand confirme.
//
// C'est la différence entre un module honnête et un module qui a l'air de
// marcher.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseService } from '../supabaseServiceClient';
import { money, notifyMerchant } from './notifications';
import { queueOrderConfirmedEmail } from '../orderEmails';
import { dedupeKey } from './dedupe';
import { matchReceipt, type MatchCandidate, type MatchOutcome } from './matching';
import { PARSERS_ARE_MOCK } from './parsers';
import { assertTransition, OPEN_STATUSES } from './states';
import { logSafe } from './mask';
import { BridgeError, logPaymentEvent } from './intents';
import {
  type BridgeMethod,
  type IntentStatus,
  type MatchStatus,
  type ReceiptProvider,
  type ReceiptSource,
  type Resolution,
} from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Depuis combien de temps une dette soldée reste candidate au rapprochement.
 *
 * Sept jours. Elle n'est pas là pour être payée — elle l'est déjà — mais pour que
 * le moteur puisse reconnaître un DOUBLON. Sans elle, un second versement sur une
 * commande réglée hier ressortirait « non rapproché », et le marchand n'aurait
 * aucune raison de soupçonner que son client a payé deux fois (§14).
 *
 * Sept jours parce qu'un client qui repaie le fait dans les jours qui suivent,
 * quand il doute d'avoir payé. Au-delà, c'est une nouvelle commande.
 */
const DUPLICATE_LOOKBACK_DAYS = 7;

export type IngestInput = {
  businessId:            string;
  provider:              ReceiptProvider;
  source:                ReceiptSource;
  amount:                number;
  currency:              'HTG' | 'USD';
  transactionReference?: string | null;
  senderIdentifier?:     string | null;
  receivedAt:            string;
  deviceId?:             string | null;
  parserVersion?:        string | null;
  /** Qui déclare cet encaissement — pour le journal, jamais pour le cloisonnement. */
  actorType:             'merchant' | 'device' | 'system' | 'admin';
  actorId?:              string | null;
  actorLabel?:           string | null;
};

export type IngestResult = {
  receiptId:    string;
  /** Vrai quand cet encaissement était déjà connu : rien n'a été refait. */
  alreadyKnown: boolean;
  outcome:      MatchOutcome | null;
  /** Renseigné seulement quand la dette a réellement été confirmée. */
  confirmed:    boolean;
  /** L'échec éventuel de la conversion en vente (stock manquant, fiche disparue). */
  settlementError: string | null;
};

/**
 * Enregistrer un encaissement constaté, puis en tirer les conséquences.
 *
 * Le seul point d'entrée : la route du compagnon Android, la saisie manuelle du
 * marchand et (demain) un webhook opérateur passent tous par ici. Trois portes
 * pour une seule logique, sinon « payé » ne veut pas dire la même chose selon la
 * porte.
 */
export async function ingestReceipt(input: IngestInput): Promise<IngestResult> {
  const svc = getSupabaseService();

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BridgeError('Le montant de cet encaissement est illisible.');
  }

  const key = dedupeKey({
    provider:             input.provider,
    amount,
    transactionReference: input.transactionReference,
    senderIdentifier:     input.senderIdentifier,
    receivedAt:           input.receivedAt,
  });

  // ── 1. L'insertion, qui est l'idempotence ────────────────────────────────
  const { data: inserted, error: insertErr } = await svc
    .from('payment_receipts')
    .insert({
      business_id:           input.businessId,
      provider:              input.provider,
      source:                input.source,
      transaction_reference: normalizedRef(input.transactionReference),
      raw_reference:         input.transactionReference ?? null,
      amount,
      currency:              input.currency,
      sender_identifier:     input.senderIdentifier ?? null,
      received_at:           input.receivedAt,
      device_id:             input.deviceId ?? null,
      parser_version:        input.parserVersion ?? null,
      dedupe_key:            key.key,
      match_status:          'pending',
    })
    .select('id')
    .single();

  if (insertErr) {
    // 23505 — déjà connu. Ce n'est pas une panne : c'est la promesse tenue.
    if (insertErr.code === '23505') {
      const { data: known } = await svc
        .from('payment_receipts')
        .select('id, match_status')
        .eq('business_id', input.businessId)
        .eq('dedupe_key', key.key)
        .maybeSingle();

      return {
        receiptId:       (known as any)?.id ?? '',
        alreadyKnown:    true,
        outcome:         null,
        confirmed:       false,
        settlementError: null,
      };
    }
    throw new Error(`encaissement non enregistré : ${insertErr.message}`);
  }

  const receiptId = (inserted as any).id as string;

  await logPaymentEvent({
    businessId: input.businessId,
    receiptId,
    eventType:  'payment_receipt_detected',
    actorType:  input.actorType,
    actorId:    input.actorId,
    actorLabel: input.actorLabel,
    metadata: {
      provider: input.provider,
      source:   input.source,
      amount,
      dedupe_basis: key.basis,
      parser_version: input.parserVersion ?? null,
    },
  });

  // ── 2. Les dettes candidates ─────────────────────────────────────────────
  const candidates = await loadCandidates(input.businessId, input.provider);

  // ── 3. La décision ───────────────────────────────────────────────────────
  let outcome = matchReceipt(
    {
      provider:             input.provider,
      amount,
      currency:             input.currency,
      transactionReference: input.transactionReference,
      senderIdentifier:     input.senderIdentifier,
      receivedAt:           input.receivedAt,
      dedupeBasis:          key.basis,
    },
    candidates,
  );

  // Le garde-fou de l'honnêteté. Voir l'en-tête : une règle d'analyse non éprouvée
  // ne confirme pas une commande.
  if (outcome.decision === 'auto_confirm'
      && input.source === 'sms_companion'
      && PARSERS_ARE_MOCK) {
    outcome = {
      ...outcome,
      decision:    'needs_review',
      matchStatus: 'pending',
      confidence:  'high',
      applyAmount: null,
      reason: {
        fr: `${outcome.reason.fr} Confirmation à valider : la lecture automatique des SMS n'est pas encore éprouvée.`,
        ht: `${outcome.reason.ht} Pou w konfime: lekti SMS otomatik la poko fin teste.`,
      },
    };
  }

  // ── 4. L'application ─────────────────────────────────────────────────────
  return applyOutcome({ input, receiptId, outcome });
}

function normalizedRef(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s === '' ? null : s;
}

/**
 * Les dettes que cet encaissement pourrait régler.
 *
 * Les ouvertes, plus les soldées récentes (pour le doublon). Le filtre par
 * `business_id` est la première ligne du cloisonnement — cette fonction tourne
 * avec la clé service, donc sans RLS, et rien d'autre ne l'empêcherait de lire
 * les dettes d'un autre commerce.
 */
async function loadCandidates(
  businessId: string,
  provider: ReceiptProvider,
): Promise<MatchCandidate[]> {
  const since = new Date(Date.now() - DUPLICATE_LOOKBACK_DAYS * 86_400_000).toISOString();

  const { data, error } = await getSupabaseService()
    .from('payment_intents')
    .select(
      'id, reference, method, charge_amount, charge_currency, amount_received, status, created_at, '
      + 'parent_intent_id, '
      + 'payment_sessions(expires_at, started_at), '
      + 'payment_evidence(declared_reference)',
    )
    .eq('business_id', businessId)
    .or(`status.in.(${OPEN_STATUSES.join(',')}),and(status.eq.confirmed,confirmed_at.gte.${since})`)
    // Un plafond : un commerce très actif peut avoir des centaines de dettes
    // ouvertes, et le moteur n'a pas besoin de toutes les voir pour être juste —
    // une dette du mois dernier ne se règle pas par le SMS de cette minute.
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(`dettes candidates illisibles : ${error.message}`);

  return ((data ?? []) as any[]).map((r) => {
    const sessions = (r.payment_sessions ?? []) as Array<{ expires_at: string; started_at: string }>;
    // La session la PLUS RÉCENTE : c'est celle dont l'échéance décide si le
    // versement est tardif. Prendre la première du tableau serait prendre celle
    // que Postgres a rendue en premier, c'est-à-dire n'importe laquelle.
    const latest = sessions
      .slice()
      .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0] ?? null;

    return {
      id:             r.id,
      reference:      r.reference,
      method:         r.method as BridgeMethod,
      chargeAmount:   Number(r.charge_amount ?? 0),
      chargeCurrency: (r.charge_currency ?? 'HTG') as 'HTG' | 'USD',
      amountReceived: Number(r.amount_received ?? 0),
      status:         r.status as IntentStatus,
      createdAt:      r.created_at,
      sessionExpiresAt: latest?.expires_at ?? null,
      parentIntentId:   r.parent_intent_id ?? null,
      declaredReferences: ((r.payment_evidence ?? []) as Array<{ declared_reference: string | null }>)
        .map((e) => e.declared_reference)
        .filter((x): x is string => typeof x === 'string' && x.trim() !== ''),
    } satisfies MatchCandidate;
  }).filter((c) =>
    // Le moteur refiltre par opérateur, mais autant ne pas lui envoyer ce qui ne
    // peut pas correspondre : sur un commerce qui accepte les deux opérateurs,
    // cela divise par deux le nombre de candidates — donc le risque d'ambiguïté.
    provider === 'moncash' ? c.method === 'moncash'
    : provider === 'natcash' ? c.method === 'natcash'
    : true,
  );
}

/** Écrire ce que la décision dit, et rien de plus. */
async function applyOutcome(params: {
  input:     IngestInput;
  receiptId: string;
  outcome:   MatchOutcome;
}): Promise<IngestResult> {
  const { input, receiptId, outcome } = params;
  const svc = getSupabaseService();

  if (outcome.decision === 'auto_confirm' && outcome.intentId && outcome.applyAmount) {
    const settled = await confirmIntent({
      intentId:  outcome.intentId,
      receiptId,
      amount:    outcome.applyAmount,
      actorType: 'system',
      via:       'auto_match',
      note:      outcome.reason.fr,
    });

    return {
      receiptId,
      alreadyKnown:    false,
      outcome,
      confirmed:       settled.status === 'confirmed',
      settlementError: settled.settlementError,
    };
  }

  // ── Tout le reste attend un humain ──────────────────────────────────────
  //
  // Le reçu porte le verdict, la dette passe en examen, et le marchand est
  // prévenu. On ne modifie NI le montant, NI le statut de la commande : la
  // décision n'est pas prise.
  const { error: recErr } = await svc
    .from('payment_receipts')
    .update({
      match_status: outcome.matchStatus,
      confidence:   outcome.confidence,
      intent_id:    outcome.intentId,
      metadata: {
        reason:        outcome.reason,
        candidate_ids: outcome.candidateIds,
        difference:    outcome.difference,
      },
    })
    .eq('id', receiptId);

  if (recErr) throw new Error(`verdict non enregistré : ${recErr.message}`);

  if (outcome.intentId) {
    // Verrou optimiste : si la dette a été confirmée entre-temps, aucune ligne ne
    // correspond et on n'écrase pas la confirmation avec « à vérifier ».
    await svc
      .from('payment_intents')
      .update({ status: 'under_review' })
      .eq('id', outcome.intentId)
      .in('status', ['created', 'awaiting_payment', 'customer_reported', 'expired']);
  }

  await logPaymentEvent({
    businessId: input.businessId,
    intentId:   outcome.intentId,
    receiptId,
    eventType:  EVENT_FOR_STATUS[outcome.matchStatus] ?? 'payment_receipt_detected',
    actorType:  input.actorType,
    actorId:    input.actorId,
    metadata: {
      match_status: outcome.matchStatus,
      confidence:   outcome.confidence,
      difference:   outcome.difference,
      candidates:   outcome.candidateIds.length,
      reason:       outcome.reason.fr,
    },
  });

  await notifyMerchant({
    businessId: input.businessId,
    event:      NOTIF_EVENT[outcome.decision],
    title:      NOTIF_TITLE[outcome.decision],
    body:       outcome.reason.fr,
    intentId:   outcome.intentId,
    receiptId,
  });

  return {
    receiptId,
    alreadyKnown:    false,
    outcome,
    confirmed:       false,
    settlementError: null,
  };
}

const EVENT_FOR_STATUS: Partial<Record<MatchStatus, Parameters<typeof logPaymentEvent>[0]['eventType']>> = {
  amount_mismatch: 'payment_amount_mismatch',
  overpayment:     'payment_overpayment',
  duplicate:       'payment_duplicate',
  late:            'payment_late',
  ambiguous:       'payment_ambiguous',
  unmatched:       'payment_unmatched',
};

const NOTIF_EVENT: Record<MatchOutcome['decision'], Parameters<typeof notifyMerchant>[0]['event']> = {
  auto_confirm:  'payment_confirmed',
  needs_review:  'payment_review',
  duplicate:     'payment_duplicate',
  unmatched:     'payment_unmatched',
};

const NOTIF_TITLE: Record<MatchOutcome['decision'], string> = {
  auto_confirm:  'Paiement confirmé',
  needs_review:  'Paiement à vérifier',
  duplicate:     'Paiement en double',
  unmatched:     'Paiement non rapproché',
};

// ─── La confirmation ────────────────────────────────────────────────────────

/** Les codes que `pp_confirm_payment_intent` lève avec un message pour le marchand. */
const RAISED_CODES = new Set(['P0002', '22023', '42501', '23505']);

export type ConfirmResult = {
  status:          IntentStatus;
  amountReceived:  number;
  remaining:       number;
  overpaid:        number;
  supplementaryId: string | null;
  saleId:          string | null;
  settlementError: string | null;
};

/**
 * Confirmer — en déléguant tout à `pp_confirm_payment_intent`.
 *
 * Cette fonction ne décide de rien et ne vérifie rien : la vérification est en
 * SQL, sous verrou de ligne, parce que c'est le seul endroit où elle vaut quelque
 * chose. Deux appareils qui détectent le même virement, ou le marchand qui
 * confirme pendant que le rapprochement confirme : PostgREST ne sait pas poser un
 * `FOR UPDATE`, donc une vérification écrite ici serait franchie par les deux
 * appels (§42).
 *
 * Ce qu'elle fait en plus : traduire le résultat en notifications. Le SQL ne doit
 * pas envoyer de courriels.
 */
export async function confirmIntent(params: {
  intentId:  string;
  receiptId: string;
  amount?:   number | null;
  actorType: 'merchant' | 'system' | 'admin';
  actorId?:  string | null;
  via:       'auto_match' | 'merchant' | 'admin' | 'provider_api';
  note?:     string | null;
}): Promise<ConfirmResult> {
  if (!UUID_RE.test(params.intentId) || !UUID_RE.test(params.receiptId)) {
    throw new BridgeError('Paiement ou encaissement introuvable.');
  }

  const svc = getSupabaseService();

  const { data, error } = await svc.rpc('pp_confirm_payment_intent', {
    p_intent_id:  params.intentId,
    p_receipt_id: params.receiptId,
    p_amount:     params.amount ?? null,
    p_actor_type: params.actorType,
    p_actor_id:   params.actorId ?? null,
    p_via:        params.via,
    p_note:       params.note ?? null,
  });

  if (error) {
    // Les refus de `pp_confirm_payment_intent` sont écrits pour être lus par un
    // marchand (« Cet encaissement règle déjà un autre paiement. ») : on les rend
    // tels quels. Mais seulement eux — reconnus à leur code ET à l'absence de
    // vocabulaire Postgres. Une violation d'index levée par la base porte aussi
    // 23505, et son message nomme des tables.
    if (RAISED_CODES.has(String(error.code))
        && !/duplicate key|violates|PGRST|relation |column /i.test(error.message)) {
      throw new BridgeError(error.message);
    }
    throw new Error(`confirmation impossible : ${error.message}`);
  }

  const r = (Array.isArray(data) ? data[0] : data) as any;
  const result: ConfirmResult = {
    status:          r?.out_status ?? 'under_review',
    amountReceived:  Number(r?.out_amount_received ?? 0),
    remaining:       Number(r?.out_remaining ?? 0),
    overpaid:        Number(r?.out_overpaid ?? 0),
    supplementaryId: r?.out_supplementary_id ?? null,
    saleId:          r?.out_sale_id ?? null,
    settlementError: r?.out_settlement_error ?? null,
  };

  // ── Ce que le marchand doit savoir, et dans quel ordre d'importance ──────
  const { data: intent } = await svc
    .from('payment_intents')
    .select('business_id, reference, charge_amount, metadata, order_id')
    .eq('id', params.intentId)
    .maybeSingle();

  // L'acheteur d'une commande de vitrine apprend qu'elle est payée et validée.
  // Pas quand la conversion en vente a échoué : la commande attend le marchand.
  const orderId = (intent as any)?.order_id as string | null | undefined;
  if (orderId && result.status === 'confirmed' && !result.settlementError) {
    queueOrderConfirmedEmail(orderId);
  }

  const businessId = (intent as any)?.business_id as string | undefined;
  if (!businessId) return result;

  const ref   = (intent as any).reference as string;
  const order = (intent as any).metadata?.order_number ?? null;

  if (result.settlementError) {
    // La plus importante des trois : l'argent est là, la commande ne s'est pas
    // convertie en vente. Sans cette alerte, le marchand ne l'apprend qu'en
    // constatant un stock qui ne baisse pas.
    console.error('[payment-bridge] commande non convertie', logSafe({
      businessId, intentId: params.intentId, reason: result.settlementError,
    }));
    await notifyMerchant({
      businessId,
      event: 'payment_settlement_failed',
      title: 'Paiement reçu, commande à régulariser',
      body: order
        ? `Le paiement de la commande ${order} est enregistré, mais la commande n'a pas pu être convertie en vente : ${result.settlementError}`
        : `Le paiement ${ref} est enregistré, mais la commande n'a pas pu être convertie en vente : ${result.settlementError}`,
      intentId: params.intentId,
      receiptId: params.receiptId,
    });
  } else if (result.status === 'confirmed') {
    await notifyMerchant({
      businessId,
      event: 'payment_confirmed',
      title: 'Paiement confirmé',
      body: order
        ? `Commande ${order} — paiement de ${money(result.amountReceived)} confirmé.`
        : `${ref} — paiement de ${money(result.amountReceived)} confirmé.`,
      intentId: params.intentId,
      receiptId: params.receiptId,
    });
  } else if (result.remaining > 0) {
    await notifyMerchant({
      businessId,
      event: 'payment_partial',
      title: 'Paiement partiel',
      body: `${ref} — ${money(result.amountReceived)} reçus, il reste ${money(result.remaining)}.`,
      intentId: params.intentId,
      receiptId: params.receiptId,
    });
  }

  if (result.overpaid > 0) {
    await notifyMerchant({
      businessId,
      event: 'payment_overpayment',
      title: 'Montant reçu supérieur',
      body: `${ref} — ${money(result.overpaid)} de plus que le montant attendu. À vous de décider quoi en faire.`,
      intentId: params.intentId,
      receiptId: params.receiptId,
    });
  }

  return result;
}

// ─── Les décisions du marchand ──────────────────────────────────────────────
//
// Chacune prend un `businessId` et le met dans son filtre. Ce n'est pas une
// redondance avec l'action serveur qui l'appelle : ces fonctions tournent avec
// la clé service, donc sans RLS, et un identifiant de dette ou d'encaissement
// deviné suffirait sinon à décider pour un autre commerce (§25, IDOR).

/**
 * Le marchand confirme un paiement qu'AUCUN signal n'a détecté.
 *
 * « Mon client m'a payé, je vois l'argent sur mon téléphone. » C'est le repli du
 * §39 : téléphone compagnon absent, SMS non reçu, analyseur muet. La parole du
 * marchand devient un encaissement de source `merchant_confirmation`, et c'est
 * CET encaissement que `pp_confirm_payment_intent` impute — la confirmation a
 * donc toujours un reçu derrière elle, même quand c'est un humain qui l'affirme.
 *
 * ── Le double clic ─────────────────────────────────────────────────────────
 *
 * La clé de déduplication est `merchant:<dette>:<reçu jusqu'ici>`. Deux clics
 * simultanés — ou deux caissiers sur deux téléphones — calculent la même clé, et
 * l'index unique n'en laisse passer qu'un. Le second reçoit un refus lisible,
 * sans rien imputer (§42, scénario 9).
 */
export async function confirmManually(params: {
  businessId: string;
  intentId:   string;
  actorId:    string;
  /** Ce que le marchand a vu. Absent : le reste dû, en entier. */
  amount?:    number | null;
  transactionReference?: string | null;
  note?:      string | null;
}): Promise<ConfirmResult> {
  if (!UUID_RE.test(params.intentId)) throw new BridgeError('Paiement introuvable.');

  const svc = getSupabaseService();
  const { data: intent, error } = await svc
    .from('payment_intents')
    .select('id, business_id, status, method, charge_amount, charge_currency, amount_received')
    .eq('id', params.intentId)
    .eq('business_id', params.businessId)
    .maybeSingle();

  if (error) throw new Error(`paiement illisible : ${error.message}`);
  if (!intent) throw new BridgeError('Paiement introuvable.');

  const i = intent as any;
  if (i.status === 'confirmed') throw new BridgeError('Ce paiement est déjà confirmé.');
  if (i.status === 'rejected' || i.status === 'cancelled') {
    throw new BridgeError('Ce paiement a été clos : il ne peut plus être confirmé.');
  }

  const received  = Number(i.amount_received ?? 0);
  const remaining = Math.max(Number(i.charge_amount) - received, 0);
  const amount    = params.amount == null ? remaining : Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
    throw new BridgeError('Indiquez le montant que vous avez reçu.');
  }

  const key = `merchant:${params.intentId}:${received.toFixed(2)}`;

  const { data: rec, error: recErr } = await svc
    .from('payment_receipts')
    .insert({
      business_id:           params.businessId,
      provider:              providerForMethod(i.method),
      source:                'merchant_confirmation',
      transaction_reference: normalizedRef(params.transactionReference),
      raw_reference:         params.transactionReference?.trim() || null,
      amount:                Math.round(amount * 100) / 100,
      currency:              i.charge_currency,
      received_at:           new Date().toISOString(),
      dedupe_key:            key,
      match_status:          'pending',
      metadata:              { declared_by_merchant: true },
    })
    .select('id')
    .single();

  if (recErr) {
    if (recErr.code === '23505') {
      // Le clic d'à côté est passé en premier. Ou bien la référence de
      // transaction saisie a déjà servi — l'index `(provider, transaction_reference)`
      // parle alors, et c'est un refus qu'il faut dire.
      if (/transaction/i.test(recErr.message)) {
        throw new BridgeError('Cette référence de transaction a déjà été enregistrée pour un autre paiement.');
      }
      throw new BridgeError("Ce paiement vient d'être confirmé depuis un autre écran. Rechargez la page.");
    }
    throw new Error(`encaissement non enregistré : ${recErr.message}`);
  }

  const receiptId = (rec as any).id as string;

  await logPaymentEvent({
    businessId: params.businessId,
    intentId:   params.intentId,
    receiptId,
    eventType:  'payment_receipt_detected',
    actorType:  'merchant',
    actorId:    params.actorId,
    metadata:   { source: 'merchant_confirmation', amount },
  });

  return confirmIntent({
    intentId:  params.intentId,
    receiptId,
    actorType: 'merchant',
    actorId:   params.actorId,
    via:       'merchant',
    note:      params.note?.slice(0, 500) ?? null,
  });
}

/**
 * Rattacher un encaissement détecté à une dette — « ce paiement non rapproché,
 * c'est la commande 1042 », ou « parmi les deux commandes possibles, c'est
 * celle-ci ».
 *
 * Les deux lignes sont relues AVEC le filtre d'entreprise avant l'appel : le SQL
 * vérifie qu'elles appartiennent au même commerce, mais pas qu'il s'agit de
 * CELUI de l'appelant.
 */
export async function linkReceipt(params: {
  businessId: string;
  receiptId:  string;
  intentId:   string;
  actorId:    string;
  amount?:    number | null;
}): Promise<ConfirmResult> {
  if (!UUID_RE.test(params.intentId) || !UUID_RE.test(params.receiptId)) {
    throw new BridgeError('Paiement ou encaissement introuvable.');
  }

  const svc = getSupabaseService();
  const [{ data: intent }, { data: receipt }] = await Promise.all([
    svc.from('payment_intents').select('id')
      .eq('id', params.intentId).eq('business_id', params.businessId).maybeSingle(),
    svc.from('payment_receipts').select('id, match_status')
      .eq('id', params.receiptId).eq('business_id', params.businessId).maybeSingle(),
  ]);

  if (!intent || !receipt) throw new BridgeError('Paiement ou encaissement introuvable.');

  const status = (receipt as any).match_status as MatchStatus;
  if (!RESOLVABLE.includes(status)) {
    throw new BridgeError('Cet encaissement a déjà été traité.');
  }

  await logPaymentEvent({
    businessId: params.businessId,
    intentId:   params.intentId,
    receiptId:  params.receiptId,
    eventType:  'payment_resolved',
    actorType:  'merchant',
    actorId:    params.actorId,
    metadata:   { action: 'linked', from: status },
  });

  return confirmIntent({
    intentId:  params.intentId,
    receiptId: params.receiptId,
    amount:    params.amount ?? null,
    actorType: 'merchant',
    actorId:   params.actorId,
    via:       'merchant',
  });
}

/**
 * Refuser ou annuler un paiement.
 *
 * `rejected` : le client a dit « j'ai payé », le marchand ne voit rien arriver.
 * `cancelled` : la commande ne se fera pas. Dans les deux cas c'est une décision,
 * pas une suppression : la dette reste, la trace reste, et un refus se conteste
 * (`disputed` — voir states.ts, c'est le seul recours du client).
 */
export async function closeIntent(params: {
  businessId: string;
  intentId:   string;
  actorId:    string;
  to:         'rejected' | 'cancelled';
  reason:     string;
}): Promise<void> {
  if (!UUID_RE.test(params.intentId)) throw new BridgeError('Paiement introuvable.');

  const svc = getSupabaseService();

  const { data: intent, error } = await svc
    .from('payment_intents')
    .select('id, business_id, status, amount_received')
    .eq('id', params.intentId)
    .eq('business_id', params.businessId)
    .maybeSingle();

  if (error) throw new Error(`paiement illisible : ${error.message}`);
  if (!intent) throw new BridgeError('Paiement introuvable.');

  const current = (intent as any).status as IntentStatus;
  const check = assertTransition(current, params.to);
  if (!check.ok) throw new BridgeError(check.reason);

  const reason = params.reason.trim().slice(0, 500) || null;

  // `.eq('status', current)` : le verrou optimiste. Si le rapprochement a
  // confirmé entre la lecture et l'écriture, zéro ligne est touchée — et un
  // paiement confirmé n'est pas refusé par un clic parti trop tard.
  const { data: moved, error: upErr } = await svc
    .from('payment_intents')
    .update({ status: params.to, closed_reason: reason })
    .eq('id', params.intentId)
    .eq('business_id', params.businessId)
    .eq('status', current)
    .select('id')
    .maybeSingle();

  if (upErr) throw new Error(`décision non enregistrée : ${upErr.message}`);
  if (!moved) {
    throw new BridgeError(
      "Ce paiement a changé d'état pendant votre action. Rechargez l'écran avant de décider.",
    );
  }

  // La session ouverte se ferme avec la dette : laisser tourner un compte à
  // rebours sur une commande refusée inviterait le client à payer quand même.
  await svc
    .from('payment_sessions')
    .update({ status: 'abandoned', closed_at: new Date().toISOString() })
    .eq('intent_id', params.intentId)
    .eq('status', 'open');

  await logPaymentEvent({
    businessId: params.businessId,
    intentId:   params.intentId,
    eventType:  params.to === 'rejected' ? 'payment_manually_rejected' : 'payment_cancelled',
    actorType:  'merchant',
    actorId:    params.actorId,
    metadata:   {
      from: current,
      reason,
      // Une dette partiellement payée qu'on annule a laissé de l'argent chez le
      // marchand : le journal doit le dire, puisque rien d'autre ne le fera.
      amount_received: Number((intent as any).amount_received ?? 0),
    },
  });
}

/**
 * Trancher le sort d'un trop-perçu, d'un doublon, ou d'un encaissement qu'on
 * écarte.
 *
 * ProfitPilot ne rembourse pas, ne crédite pas, ne compense pas : il ENREGISTRE
 * ce que le marchand a décidé (§14, §16). La différence n'est pas rhétorique —
 * créditer automatiquement le client d'un trop-perçu reviendrait à disposer de
 * l'argent du marchand.
 *
 * `ignored` écarte un encaissement (`match_status = 'rejected'`) : un SMS mal lu,
 * un transfert personnel qui n'a rien à voir avec la boutique. Les autres
 * résolutions le marquent `resolved`.
 */
export async function resolveReceipt(params: {
  businessId: string;
  receiptId:  string;
  resolution: Resolution;
  note?:      string | null;
  actorId:    string;
}): Promise<void> {
  if (!UUID_RE.test(params.receiptId)) throw new BridgeError('Encaissement introuvable.');

  const svc = getSupabaseService();

  const { data: receipt, error } = await svc
    .from('payment_receipts')
    .select('id, business_id, intent_id, match_status, amount')
    .eq('id', params.receiptId)
    .eq('business_id', params.businessId)
    .maybeSingle();

  if (error) throw new Error(`encaissement illisible : ${error.message}`);
  if (!receipt) throw new BridgeError('Encaissement introuvable.');

  const from = (receipt as any).match_status as MatchStatus;
  if (!RESOLVABLE.includes(from)) {
    // Un encaissement rapproché a réglé une commande : le « résoudre » effacerait
    // la trace de ce règlement sans défaire le règlement lui-même.
    throw new BridgeError('Cet encaissement ne demande aucune décision.');
  }

  const note = params.note?.trim().slice(0, 500) || null;

  const { data: moved, error: upErr } = await svc
    .from('payment_receipts')
    .update({
      match_status:    params.resolution === 'ignored' ? 'rejected' : 'resolved',
      resolution:      params.resolution,
      resolution_note: note,
      resolved_by:     params.actorId,
      resolved_at:     new Date().toISOString(),
    })
    .eq('id', params.receiptId)
    .eq('business_id', params.businessId)
    .eq('match_status', from)
    .select('id')
    .maybeSingle();

  if (upErr) throw new Error(`décision non enregistrée : ${upErr.message}`);
  if (!moved) {
    throw new BridgeError("Cet encaissement a changé d'état pendant votre action. Rechargez l'écran.");
  }

  await logPaymentEvent({
    businessId: params.businessId,
    intentId:   (receipt as any).intent_id,
    receiptId:  params.receiptId,
    eventType:  'payment_resolved',
    actorType:  'merchant',
    actorId:    params.actorId,
    metadata: {
      resolution: params.resolution,
      from,
      amount:     Number((receipt as any).amount ?? 0),
      note,
    },
  });
}

/** Les verdicts qui attendent encore une décision du marchand. */
const RESOLVABLE: readonly MatchStatus[] = [
  'pending', 'late', 'ambiguous', 'unmatched', 'duplicate', 'overpayment', 'amount_mismatch',
];

function providerForMethod(method: string): ReceiptProvider {
  switch (method) {
    case 'moncash':       return 'moncash';
    case 'natcash':       return 'natcash';
    case 'cash':
    case 'cod':           return 'cash';
    case 'bank_transfer': return 'bank';
    default:              return 'other';
  }
}
