'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Payment Bridge — ce que le marchand fait depuis son écran
//
// ── Lire par la RLS, écrire par les services ───────────────────────────────
//
// Les LECTURES passent par le client de session (`ctx.supabase`) : la RLS de la
// migration 20260927 cloisonne, et ce fichier ne la contourne pas (§25).
//
// Les DÉCISIONS passent par lib/paymentBridge/receipts.ts, qui écrit avec la clé
// service — parce que `payment_intents` n'accorde AUCUNE écriture au rôle
// `authenticated`, et c'est voulu : le montant dû ne se modifie pas depuis une
// interface. Chaque service reçoit `ctx.businessId`, jamais un identifiant
// d'entreprise venu du navigateur, et le met dans son filtre.
//
// ── Qui peut quoi ──────────────────────────────────────────────────────────
//
//   voir les paiements          `sales:read`    — un caissier doit pouvoir dire
//                                                  au client « c'est arrivé »
//   confirmer, refuser, trancher `sales:update` — confirmer un paiement crée
//                                                  une vente et sort du stock
//   numéros et appareils        propriétaire ou administrateur — changer le
//                                numéro d'encaissement, c'est détourner les
//                                recettes du commerce. La même règle que la
//                                politique `mpm_write`.
//
// Toutes les actions renvoient un `ActionResult` (lib/actionResult.ts) : en
// production, Next efface le message des erreurs LEVÉES.
// ─────────────────────────────────────────────────────────────────────────────

import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';
import { getBusinessContext, type BusinessContext } from '../../lib/serverAuth';
import { logActivity } from '../../lib/activityLog';
import {
  buildInbox,
  computeStats,
  type BridgeStats,
  type InboxCard,
  type InboxIntentRow,
  type InboxReceiptRow,
} from '../../lib/paymentBridge/inbox';
import {
  closeIntent,
  confirmManually,
  ingestReceipt,
  linkReceipt,
  resolveReceipt,
  type ConfirmResult,
} from '../../lib/paymentBridge/receipts';
import { registerDevice, revokeDevice } from '../../lib/paymentBridge/deviceAuth';
import { formatHaitianPhone, maskPhone } from '../../lib/paymentBridge/mask';
import {
  INTENT_STATUS_LABEL,
  METHOD_LABEL,
  type BridgeMethod,
  type DeviceStatus,
  type IntentStatus,
  type ReceiptProvider,
  type Resolution,
} from '../../lib/paymentBridge/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Need = 'read' | 'decide' | 'configure';

async function bridgeContext(need: Need): Promise<BusinessContext> {
  const ctx = await getBusinessContext();
  const ok =
    need === 'read'      ? ctx.can('sales:read')
    : need === 'decide'  ? ctx.can('sales:update')
    : ctx.role === 'owner' || ctx.role === 'admin';

  if (!ok) {
    throw new UserFacingError(
      need === 'configure'
        ? "Seul le propriétaire ou un administrateur peut modifier les moyens de paiement et les appareils."
        : need === 'decide'
        ? "Votre rôle ne permet pas de confirmer ou refuser un paiement."
        : "Votre rôle ne permet pas de consulter les paiements.",
    );
  }
  return ctx;
}

function uuid(v: unknown, what = 'Paiement'): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new UserFacingError(`${what} introuvable.`);
  return v;
}

// ═══════════════════════════════════════════════════════════════════════════
// La boîte de réception
// ═══════════════════════════════════════════════════════════════════════════

export type PaymentInbox = {
  cards:     InboxCard[];
  stats:     BridgeStats;
  canDecide: boolean;
  /** Le commerce a-t-il déclaré au moins un numéro ? Sinon, l'écran l'y invite. */
  configured: boolean;
};

/**
 * Tout ce que l'écran « Paiements » affiche, en une fois.
 *
 * Soixante jours et trois cents lignes : la boîte de réception sert à décider,
 * pas à archiver. L'historique complet reste dans `payment_events`.
 */
export async function getPaymentInbox(): Promise<ActionResult<PaymentInbox>> {
  return attempt(async () => {
    const ctx = await bridgeContext('read');
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();

    const [intentsRes, receiptsRes, methodsRes] = await Promise.all([
      ctx.supabase
        .from('payment_intents')
        .select(
          'id, reference, status, method, charge_amount, charge_currency, amount_received, '
          + 'created_at, confirmed_at, parent_intent_id, order_id, '
          + 'orders(order_number, customer_name), '
          + 'payment_evidence(declared_amount, declared_reference, created_at)',
        )
        .eq('business_id', ctx.businessId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(300),
      ctx.supabase
        .from('payment_receipts')
        .select(
          'id, intent_id, provider, source, amount, currency, transaction_reference, '
          + 'sender_identifier, received_at, match_status, applied_amount, resolution, metadata, '
          + 'merchant_devices(device_name)',
        )
        .eq('business_id', ctx.businessId)
        .gte('received_at', since)
        .order('received_at', { ascending: false })
        .limit(300),
      ctx.supabase
        .from('merchant_payment_methods')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', ctx.businessId)
        .is('deleted_at', null),
    ]);

    if (intentsRes.error)  throw new Error(`paiements illisibles : ${intentsRes.error.message}`);
    if (receiptsRes.error) throw new Error(`encaissements illisibles : ${receiptsRes.error.message}`);

    const rawIntents = (intentsRes.data ?? []) as any[];
    const refById = new Map(rawIntents.map((r) => [r.id as string, r.reference as string]));

    const intents: InboxIntentRow[] = rawIntents.map((r) => {
      const order = one(r.orders);
      const ev = ((r.payment_evidence ?? []) as any[])
        .slice()
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
      return {
        id:              r.id,
        reference:       r.reference,
        status:          r.status,
        method:          r.method,
        chargeAmount:    Number(r.charge_amount ?? 0),
        chargeCurrency:  r.charge_currency ?? 'HTG',
        amountReceived:  Number(r.amount_received ?? 0),
        createdAt:       r.created_at,
        confirmedAt:     r.confirmed_at ?? null,
        parentIntentId:  r.parent_intent_id ?? null,
        parentReference: r.parent_intent_id ? refById.get(r.parent_intent_id) ?? null : null,
        orderId:         r.order_id ?? null,
        orderNumber:     order?.order_number ?? null,
        customerName:    order?.customer_name ?? null,
        declared: ev
          ? { amount: ev.declared_amount == null ? null : Number(ev.declared_amount),
              reference: ev.declared_reference ?? null, at: ev.created_at }
          : null,
      };
    });

    const receipts: InboxReceiptRow[] = ((receiptsRes.data ?? []) as any[]).map((r) => ({
      id:                   r.id,
      intentId:             r.intent_id ?? null,
      provider:             r.provider,
      source:               r.source,
      amount:               Number(r.amount ?? 0),
      currency:             r.currency ?? 'HTG',
      transactionReference: r.transaction_reference ?? null,
      senderIdentifier:     r.sender_identifier ?? null,
      receivedAt:           r.received_at,
      matchStatus:          r.match_status,
      appliedAmount:        r.applied_amount == null ? null : Number(r.applied_amount),
      resolution:           r.resolution ?? null,
      deviceName:           one(r.merchant_devices)?.device_name ?? null,
      reason:               r.metadata?.reason?.fr ?? null,
      candidateIds:         Array.isArray(r.metadata?.candidate_ids) ? r.metadata.candidate_ids : [],
    }));

    const cards = buildInbox(intents, receipts);

    return {
      cards,
      stats:      computeStats(cards, receipts, new Date().toISOString()),
      canDecide:  ctx.can('sales:update'),
      configured: (methodsRes.count ?? 0) > 0,
    };
  });
}

/** L'historique d'un paiement — ce que le marchand relit devant un litige. */
export type PaymentTimelineEntry = {
  at:     string;
  label:  string;
  actor:  string;
  detail: string | null;
};

export async function getPaymentTimeline(intentId: string): Promise<ActionResult<PaymentTimelineEntry[]>> {
  return attempt(async () => {
    const ctx = await bridgeContext('read');
    const id = uuid(intentId);

    const { data, error } = await ctx.supabase
      .from('payment_events')
      .select('event_type, actor_type, actor_label, metadata, created_at')
      .eq('business_id', ctx.businessId)
      .eq('intent_id', id)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) throw new Error(`historique illisible : ${error.message}`);

    return ((data ?? []) as any[]).map((e) => ({
      at:     e.created_at,
      label:  EVENT_LABEL[e.event_type] ?? e.event_type,
      actor:  ACTOR_LABEL[e.actor_type] ?? e.actor_type,
      detail: eventDetail(e),
    }));
  });
}

const EVENT_LABEL: Record<string, string> = {
  payment_created:            'Paiement créé',
  payment_session_started:    'Instructions affichées au client',
  payment_session_expired:    'Délai de paiement écoulé',
  payment_reported:           'Le client dit avoir payé',
  payment_receipt_detected:   'Encaissement détecté',
  payment_auto_matched:       'Confirmé automatiquement',
  payment_partially_received: 'Paiement partiel reçu',
  payment_manually_confirmed: 'Confirmé par le commerce',
  payment_admin_confirmed:    'Confirmé par le support',
  payment_manually_rejected:  'Refusé par le commerce',
  payment_disputed:           'Contesté',
  payment_late:               'Paiement tardif',
  payment_amount_mismatch:    'Montant inférieur',
  payment_overpayment:        'Montant supérieur',
  payment_duplicate:          'Paiement en double',
  payment_unmatched:          'Non rapproché',
  payment_ambiguous:          'Plusieurs commandes possibles',
  payment_resolved:           'Décision enregistrée',
  payment_cancelled:          'Annulé',
  payment_expired:            'Sans suite',
};

const ACTOR_LABEL: Record<string, string> = {
  customer: 'Client',
  merchant: 'Commerce',
  system:   'ProfitPilot',
  device:   'Téléphone',
  admin:    'Support',
};

const RESOLUTION_LABEL: Record<Resolution, string> = {
  credit_next_invoice: 'à déduire de la prochaine facture',
  customer_credit:     'crédit client',
  refunded_manually:   'remboursé par vous',
  resolved_manually:   'réglé autrement',
  ignored:             'écarté',
};

function eventDetail(e: any): string | null {
  const m = e.metadata ?? {};
  if (e.event_type === 'payment_resolved' && m.resolution) {
    return RESOLUTION_LABEL[m.resolution as Resolution] ?? null;
  }
  if (typeof m.reason === 'string' && m.reason) return m.reason;
  if (e.actor_type === 'device' && e.actor_label) return e.actor_label;
  return null;
}

/** Les dettes ouvertes, pour rattacher un encaissement : « c'est la commande 1042 ». */
export type OpenIntentOption = {
  id:          string;
  reference:   string;
  orderNumber: string | null;
  customer:    string | null;
  remaining:   number;
  currency:    string;
  method:      string;
  status:      string;
};

export async function listOpenIntents(): Promise<ActionResult<OpenIntentOption[]>> {
  return attempt(async () => {
    const ctx = await bridgeContext('decide');

    const { data, error } = await ctx.supabase
      .from('payment_intents')
      .select('id, reference, status, method, charge_amount, charge_currency, amount_received, '
        + 'orders(order_number, customer_name)')
      .eq('business_id', ctx.businessId)
      .in('status', ['created', 'awaiting_payment', 'customer_reported', 'under_review',
                     'partially_paid', 'expired', 'disputed'] satisfies IntentStatus[])
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(`paiements illisibles : ${error.message}`);

    return ((data ?? []) as any[]).map((r) => {
      const order = one(r.orders);
      return {
        id:          r.id,
        reference:   r.reference,
        orderNumber: order?.order_number ?? null,
        customer:    order?.customer_name ?? null,
        remaining:   Math.max(Number(r.charge_amount) - Number(r.amount_received ?? 0), 0),
        currency:    r.charge_currency ?? 'HTG',
        method:      METHOD_LABEL[r.method as BridgeMethod]?.fr ?? r.method,
        status:      INTENT_STATUS_LABEL[r.status as IntentStatus]?.fr ?? r.status,
      };
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Les décisions
// ═══════════════════════════════════════════════════════════════════════════

export type DecisionOutcome = {
  status:          IntentStatus;
  remaining:       number;
  overpaid:        number;
  /** L'argent est enregistré mais la commande n'a pas pu devenir une vente. */
  settlementError: string | null;
};

function outcome(r: ConfirmResult): DecisionOutcome {
  return {
    status:          r.status,
    remaining:       r.remaining,
    overpaid:        r.overpaid,
    settlementError: r.settlementError,
  };
}

/**
 * Confirmer.
 *
 * Avec `receiptId` : l'encaissement détecté est imputé à cette dette. Sans : le
 * marchand affirme avoir reçu l'argent (repli manuel du §39), et cette parole
 * devient elle-même un encaissement tracé.
 */
export async function confirmPayment(input: {
  intentId:   string;
  receiptId?: string | null;
  amount?:    number | null;
  transactionReference?: string | null;
}): Promise<ActionResult<DecisionOutcome>> {
  return attempt(async () => {
    const ctx = await bridgeContext('decide');
    const intentId = uuid(input.intentId);

    const res = input.receiptId
      ? await linkReceipt({
          businessId: ctx.businessId,
          intentId,
          receiptId:  uuid(input.receiptId, 'Encaissement'),
          actorId:    ctx.userId,
        })
      : await confirmManually({
          businessId: ctx.businessId,
          intentId,
          actorId:    ctx.userId,
          amount:     input.amount ?? null,
          transactionReference: typeof input.transactionReference === 'string'
            ? input.transactionReference.slice(0, 64) : null,
        });

    void logActivity({
      action: 'confirm', entity: 'payment', entityId: intentId,
      newValues: { status: res.status, via: input.receiptId ? 'detected_receipt' : 'merchant' },
      businessId: ctx.businessId, userId: ctx.userId,
    });

    return outcome(res);
  });
}

/** Rattacher un encaissement non rapproché (ou ambigu) à une dette choisie. */
export async function linkPaymentReceipt(input: {
  receiptId: string;
  intentId:  string;
}): Promise<ActionResult<DecisionOutcome>> {
  return attempt(async () => {
    const ctx = await bridgeContext('decide');
    const res = await linkReceipt({
      businessId: ctx.businessId,
      receiptId:  uuid(input.receiptId, 'Encaissement'),
      intentId:   uuid(input.intentId),
      actorId:    ctx.userId,
    });

    void logActivity({
      action: 'confirm', entity: 'payment', entityId: input.intentId,
      newValues: { linked_receipt: input.receiptId, status: res.status },
      businessId: ctx.businessId, userId: ctx.userId,
    });

    return outcome(res);
  });
}

export async function rejectPayment(input: {
  intentId: string;
  reason:   string;
}): Promise<ActionResult<void>> {
  return attempt(async () => {
    const ctx = await bridgeContext('decide');
    const intentId = uuid(input.intentId);
    await closeIntent({
      businessId: ctx.businessId, intentId, actorId: ctx.userId,
      to: 'rejected', reason: String(input.reason ?? ''),
    });
    void logActivity({
      action: 'reject', entity: 'payment', entityId: intentId,
      newValues: { reason: String(input.reason ?? '').slice(0, 200) },
      businessId: ctx.businessId, userId: ctx.userId,
    });
  });
}

export async function cancelPayment(input: {
  intentId: string;
  reason?:  string;
}): Promise<ActionResult<void>> {
  return attempt(async () => {
    const ctx = await bridgeContext('decide');
    const intentId = uuid(input.intentId);
    await closeIntent({
      businessId: ctx.businessId, intentId, actorId: ctx.userId,
      to: 'cancelled', reason: String(input.reason ?? ''),
    });
    void logActivity({
      action: 'archive', entity: 'payment', entityId: intentId,
      newValues: { status: 'cancelled' },
      businessId: ctx.businessId, userId: ctx.userId,
    });
  });
}

const RESOLUTIONS: readonly Resolution[] = [
  'credit_next_invoice', 'customer_credit', 'refunded_manually', 'resolved_manually', 'ignored',
];

/**
 * Trancher un doublon, un trop-perçu, ou écarter un encaissement.
 *
 * Rien ne bouge d'argent : la décision est ENREGISTRÉE (§14, §16). Rembourser se
 * fait sur le téléphone du marchand, pas ici.
 */
export async function resolvePaymentReceipt(input: {
  receiptId:  string;
  resolution: Resolution;
  note?:      string | null;
}): Promise<ActionResult<void>> {
  return attempt(async () => {
    const ctx = await bridgeContext('decide');
    if (!RESOLUTIONS.includes(input.resolution)) throw new UserFacingError('Choisissez une décision.');
    const receiptId = uuid(input.receiptId, 'Encaissement');

    await resolveReceipt({
      businessId: ctx.businessId,
      receiptId,
      resolution: input.resolution,
      note:       input.note ?? null,
      actorId:    ctx.userId,
    });
    void logActivity({
      action: 'update', entity: 'payment', entityId: receiptId,
      newValues: { resolution: input.resolution },
      businessId: ctx.businessId, userId: ctx.userId,
    });
  });
}

const PROVIDERS: readonly ReceiptProvider[] = ['moncash', 'natcash', 'cash', 'bank', 'other'];

/**
 * « J'ai reçu 4 500 G sur MonCash à 14 h 22. » Le marchand recopie son relevé.
 *
 * Passe par le même rapprochement que le téléphone compagnon : un seul chemin,
 * sinon « payé » ne voudrait pas dire la même chose selon la porte. Et comme ce
 * n'est pas un analyseur de SMS non éprouvé qui a lu le montant mais le marchand
 * lui-même, un rapprochement exact peut confirmer seul.
 */
export async function recordReceivedPayment(input: {
  provider:             ReceiptProvider;
  amount:               number;
  transactionReference?: string | null;
  senderPhone?:         string | null;
  receivedAt?:          string | null;
}): Promise<ActionResult<{ matchStatus: string | null; confirmed: boolean; alreadyKnown: boolean }>> {
  return attempt(async () => {
    const ctx = await bridgeContext('decide');

    if (!PROVIDERS.includes(input.provider)) throw new UserFacingError('Choisissez le moyen de paiement.');
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
      throw new UserFacingError('Indiquez le montant reçu.');
    }

    let receivedAt = new Date();
    if (input.receivedAt) {
      const d = new Date(input.receivedAt);
      if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 5 * 60_000) {
        throw new UserFacingError("L'heure du paiement est invalide.");
      }
      receivedAt = d;
    }

    const res = await ingestReceipt({
      businessId:           ctx.businessId,
      provider:             input.provider,
      source:               'manual_entry',
      amount,
      currency:             'HTG',
      transactionReference: input.transactionReference?.trim().slice(0, 64) || null,
      senderIdentifier:     input.senderPhone?.trim().slice(0, 32) || null,
      receivedAt:           receivedAt.toISOString(),
      actorType:            'merchant',
      actorId:              ctx.userId,
    });

    return {
      matchStatus:  res.outcome?.matchStatus ?? null,
      confirmed:    res.confirmed,
      alreadyKnown: res.alreadyKnown,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Les numéros d'encaissement
// ═══════════════════════════════════════════════════════════════════════════

export type MerchantMethod = {
  id:           string;
  method:       BridgeMethod;
  destination:  string | null;
  /** Masqué pour l'affichage en liste ; le formulaire d'édition lit `destination`. */
  masked:       string;
  displayLabel: string | null;
  instructions: string | null;
  isEnabled:    boolean;
  isDefault:    boolean;
};

export async function listPaymentMethods(): Promise<ActionResult<{ methods: MerchantMethod[]; canEdit: boolean }>> {
  return attempt(async () => {
    const ctx = await bridgeContext('read');

    const { data, error } = await ctx.supabase
      .from('merchant_payment_methods')
      .select('id, method, destination, display_label, instructions, is_enabled, is_default')
      .eq('business_id', ctx.businessId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`moyens de paiement illisibles : ${error.message}`);

    const canEdit = ctx.role === 'owner' || ctx.role === 'admin';
    return {
      canEdit,
      methods: ((data ?? []) as any[]).map((r) => ({
        id:           r.id,
        method:       r.method,
        // Le numéro complet n'est rendu qu'à qui peut le modifier : un caissier
        // n'a besoin que de le reconnaître.
        destination:  canEdit ? formatHaitianPhone(r.destination) || r.destination : null,
        masked:       maskPhone(r.destination) || '',
        displayLabel: r.display_label ?? null,
        instructions: r.instructions ?? null,
        isEnabled:    !!r.is_enabled,
        isDefault:    !!r.is_default,
      })),
    };
  });
}

const EDITABLE_METHODS: readonly BridgeMethod[] = ['moncash', 'natcash', 'bank_transfer', 'cash', 'cod', 'other'];

/**
 * Normaliser un numéro haïtien en `+509XXXXXXXX`.
 *
 * Huit chiffres, commençant par 2, 3, 4 ou 5 — les préfixes mobiles et fixes du
 * plan de numérotation haïtien. Un numéro mal saisi ici, c'est l'argent de tous
 * les clients envoyé à quelqu'un d'autre : on refuse plutôt que deviner.
 */
function normalizeHaitianMobile(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('509') && digits.length === 11 ? digits.slice(3) : digits;
  if (!/^[2-5]\d{7}$/.test(local)) {
    throw new UserFacingError('Numéro invalide : saisissez les 8 chiffres, par exemple 3712 4521.');
  }
  return `+509${local}`;
}

export async function savePaymentMethod(input: {
  id?:           string | null;
  method:        BridgeMethod;
  destination?:  string | null;
  displayLabel?: string | null;
  instructions?: string | null;
  isEnabled?:    boolean;
}): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    const ctx = await bridgeContext('configure');

    if (!EDITABLE_METHODS.includes(input.method)) throw new UserFacingError('Moyen de paiement inconnu.');

    const mobile = input.method === 'moncash' || input.method === 'natcash';
    let destination: string | null = input.destination?.trim() || null;
    if (mobile) {
      if (!destination) throw new UserFacingError('Indiquez le numéro sur lequel vos clients vous paient.');
      destination = normalizeHaitianMobile(destination);
    } else if (destination) {
      destination = destination.slice(0, 120);
    }

    const row = {
      method:        input.method,
      provider:      input.method === 'moncash' ? 'digicel' : input.method === 'natcash' ? 'natcom' : null,
      destination,
      display_label: input.displayLabel?.trim().slice(0, 80) || null,
      instructions:  input.instructions?.trim().slice(0, 300) || null,
      is_enabled:    input.isEnabled ?? true,
    };

    // Par la RLS (`mpm_write` : propriétaire ou administrateur). Le filtre
    // `business_id` est redit pour qu'un identifiant d'une autre boutique ne
    // touche rien même si une politique venait à s'élargir.
    let id: string;
    let previous: string | null = null;

    if (input.id) {
      const existingId = uuid(input.id, 'Moyen de paiement');
      const { data: before } = await ctx.supabase
        .from('merchant_payment_methods')
        .select('destination')
        .eq('id', existingId)
        .eq('business_id', ctx.businessId)
        .maybeSingle();
      previous = (before as any)?.destination ?? null;

      const { data, error } = await ctx.supabase
        .from('merchant_payment_methods')
        .update(row)
        .eq('id', existingId)
        .eq('business_id', ctx.businessId)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle();
      if (error) throw mapMethodError(error);
      if (!data) throw new UserFacingError('Moyen de paiement introuvable.');
      id = (data as any).id;
    } else {
      // Le premier moyen déclaré devient celui par défaut : sans défaut, deux
      // numéros actifs pour le même opérateur seraient départagés par l'âge.
      const { count } = await ctx.supabase
        .from('merchant_payment_methods')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', ctx.businessId)
        .is('deleted_at', null);

      const { data, error } = await ctx.supabase
        .from('merchant_payment_methods')
        .insert({ ...row, business_id: ctx.businessId, is_default: (count ?? 0) === 0 })
        .select('id')
        .single();
      if (error) throw mapMethodError(error);
      id = (data as any).id;
    }

    // Changer le numéro d'encaissement est le geste le plus sensible du module :
    // il détourne toutes les recettes à venir. Il laisse une trace, avec
    // l'ancien et le nouveau numéro MASQUÉS — le journal est lisible par tous
    // les membres.
    void logActivity({
      action:    input.id ? 'update' : 'create',
      entity:    'payment',
      entityId:  id,
      oldValues: input.id ? { destination: maskPhone(previous) } : undefined,
      newValues: { method: input.method, destination: maskPhone(destination), enabled: row.is_enabled },
      businessId: ctx.businessId, userId: ctx.userId,
    });

    return { id };
  });
}

function mapMethodError(error: { code?: string; message: string }): Error {
  if (error.code === '23505') return new UserFacingError('Ce numéro est déjà enregistré pour ce moyen de paiement.');
  if (error.code === '42501') {
    return new UserFacingError("Seul le propriétaire ou un administrateur peut modifier les moyens de paiement.");
  }
  return new Error(`moyen de paiement non enregistré : ${error.message}`);
}

/**
 * Retirer un moyen de paiement.
 *
 * Désactivé et marqué supprimé, jamais effacé : des paiements passés désignent
 * cette ligne (`destination_method_id … ON DELETE RESTRICT`), et « payé sur quel
 * numéro ? » doit rester répondable.
 */
export async function removePaymentMethod(id: string): Promise<ActionResult<void>> {
  return attempt(async () => {
    const ctx = await bridgeContext('configure');
    const methodId = uuid(id, 'Moyen de paiement');

    const { data, error } = await ctx.supabase
      .from('merchant_payment_methods')
      .update({ is_enabled: false, is_default: false, deleted_at: new Date().toISOString() })
      .eq('id', methodId)
      .eq('business_id', ctx.businessId)
      .is('deleted_at', null)
      .select('method, destination')
      .maybeSingle();

    if (error) throw mapMethodError(error);
    if (!data) throw new UserFacingError('Moyen de paiement introuvable.');

    void logActivity({
      action: 'delete', entity: 'payment', entityId: methodId,
      oldValues: { method: (data as any).method, destination: maskPhone((data as any).destination) },
      businessId: ctx.businessId, userId: ctx.userId,
    });
  });
}

/**
 * Définir par défaut.
 *
 * Deux écritures, dans cet ordre : retirer l'ancien défaut, poser le nouveau.
 * L'index unique partiel `idx_mpm_single_default` refuse deux défauts ; dans
 * l'ordre inverse, la seconde écriture échouerait toujours.
 */
export async function setDefaultPaymentMethod(id: string): Promise<ActionResult<void>> {
  return attempt(async () => {
    const ctx = await bridgeContext('configure');
    const methodId = uuid(id, 'Moyen de paiement');

    const { error: clearErr } = await ctx.supabase
      .from('merchant_payment_methods')
      .update({ is_default: false })
      .eq('business_id', ctx.businessId)
      .eq('is_default', true);
    if (clearErr) throw mapMethodError(clearErr);

    const { data, error } = await ctx.supabase
      .from('merchant_payment_methods')
      .update({ is_default: true, is_enabled: true })
      .eq('id', methodId)
      .eq('business_id', ctx.businessId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) throw mapMethodError(error);
    if (!data) throw new UserFacingError('Moyen de paiement introuvable.');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Les appareils compagnons
// ═══════════════════════════════════════════════════════════════════════════

export type MerchantDevice = {
  id:          string;
  name:        string;
  platform:    string;
  appVersion:  string | null;
  tokenPrefix: string;
  status:      DeviceStatus;
  lastSeenAt:  string | null;
  lastSyncAt:  string | null;
  createdAt:   string;
};

export async function listDevices(): Promise<ActionResult<MerchantDevice[]>> {
  return attempt(async () => {
    const ctx = await bridgeContext('read');

    // Les colonnes sont NOMMÉES : `token_hash` n'est pas lisible par ce rôle, et
    // un `select('*')` échouerait (voir le GRANT de colonnes de la migration).
    const { data, error } = await ctx.supabase
      .from('merchant_devices')
      .select('id, device_name, platform, app_version, token_prefix, status, last_seen_at, last_sync_at, created_at')
      .eq('business_id', ctx.businessId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`appareils illisibles : ${error.message}`);

    return ((data ?? []) as any[]).map((d) => ({
      id:          d.id,
      name:        d.device_name,
      platform:    d.platform,
      appVersion:  d.app_version ?? null,
      tokenPrefix: d.token_prefix,
      status:      d.status,
      lastSeenAt:  d.last_seen_at ?? null,
      lastSyncAt:  d.last_sync_at ?? null,
      createdAt:   d.created_at,
    }));
  });
}

/**
 * Enrôler un téléphone. Le jeton est rendu UNE fois : il n'est stocké que haché.
 */
export async function enrollDevice(input: { name: string }): Promise<ActionResult<{ deviceId: string; token: string }>> {
  return attempt(async () => {
    const ctx = await bridgeContext('configure');
    const name = String(input.name ?? '').trim();
    if (!name) throw new UserFacingError("Donnez un nom à ce téléphone, par exemple « Téléphone de la boutique ».");

    const res = await registerDevice({
      businessId: ctx.businessId,
      userId:     ctx.userId,
      deviceName: name,
      platform:   'android',
    });

    void logActivity({
      action: 'create', entity: 'payment', entityId: res.deviceId,
      newValues: { device: name, token_prefix: res.prefix },
      businessId: ctx.businessId, userId: ctx.userId,
    });

    return { deviceId: res.deviceId, token: res.token };
  });
}

export async function revokeMerchantDevice(id: string): Promise<ActionResult<void>> {
  return attempt(async () => {
    const ctx = await bridgeContext('configure');
    const deviceId = uuid(id, 'Appareil');
    await revokeDevice({ deviceId, businessId: ctx.businessId, userId: ctx.userId });
    void logActivity({
      action: 'revoke', entity: 'payment', entityId: deviceId,
      businessId: ctx.businessId, userId: ctx.userId,
    });
  });
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}
