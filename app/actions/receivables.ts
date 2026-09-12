'use server';

// ─────────────────────────────────────────────────────────────────────────────
// Registre de créances — Diagnostic 3 (la trésorerie fantôme / dettes moun)
//
// Source de vérité : les ventes à crédit (sales.payment_status <> 'paid'),
// exposées par la vue v_receivables avec échéance + statut calculés.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { getBusinessContext } from '../../lib/serverAuth';
import { assertFeature } from '../../lib/entitlements';
import { buildReminderMessage, buildWhatsAppLink } from '../../lib/whatsappReport';
import { logActivity } from '../../lib/activityLog';
import { recordSalePaymentEntry } from '../../lib/accounting/posting';
import { markCustomerCreditPaid } from './customers';

export type ReceivableStatus = 'open' | 'due_soon' | 'overdue' | 'critical' | 'paid';

export type Receivable = {
  saleId: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  invoiceNumber: string | null;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  currency: string;
  saleDate: string;
  dueDate: string | null;
  daysOverdue: number;
  status: ReceivableStatus;
  lastReminderAt: string | null;
  reminderCount: number;
};

export type ReceivablesSummary = {
  items: Receivable[];
  totalOutstanding: number;
  totalOverdue: number;
  dueSoonCount: number;
  overdueCount: number;
  currency: string;
};

function mapRow(row: any): Receivable {
  return {
    saleId:         row.sale_id,
    customerId:     row.customer_id ?? null,
    customerName:   row.customer_name ?? 'Client',
    customerPhone:  row.customer_phone ?? null,
    invoiceNumber:  row.invoice_number ?? null,
    totalAmount:    Number(row.total_amount ?? 0),
    paidAmount:     Number(row.paid_amount ?? 0),
    balanceDue:     Number(row.balance_due ?? 0),
    currency:       row.currency ?? 'HTG',
    saleDate:       row.sale_date,
    dueDate:        row.due_date ?? null,
    daysOverdue:    Math.max(Number(row.days_overdue ?? 0), 0),
    status:         (row.status ?? 'open') as ReceivableStatus,
    lastReminderAt: row.last_reminder_at ?? null,
    reminderCount:  Number(row.reminder_count ?? 0),
  };
}

/** Toutes les créances ouvertes de l'entreprise active, les plus urgentes d'abord. */
export async function listReceivables(): Promise<ReceivablesSummary> {
  await assertFeature('receivables');
  const { supabase, businessId, defaultCurrency } = await getBusinessContext();

  const { data, error } = await supabase
    .from('v_receivables')
    .select('*')
    .eq('business_id', businessId)
    .order('due_date', { ascending: true, nullsFirst: false });

  if (error) throw new Error(error.message);

  const items = (data ?? []).map(mapRow).filter((r) => r.balanceDue > 0);
  const rank: Record<ReceivableStatus, number> = {
    critical: 0, overdue: 1, due_soon: 2, open: 3, paid: 4,
  };
  items.sort((a, b) => rank[a.status] - rank[b.status] || b.daysOverdue - a.daysOverdue);

  const overdue = items.filter((r) => r.status === 'overdue' || r.status === 'critical');

  return {
    items,
    totalOutstanding: items.reduce((s, r) => s + r.balanceDue, 0),
    totalOverdue:     overdue.reduce((s, r) => s + r.balanceDue, 0),
    dueSoonCount:     items.filter((r) => r.status === 'due_soon').length,
    overdueCount:     overdue.length,
    currency:         defaultCurrency,
  };
}

/** Fixe ou déplace l'échéance d'une créance. */
export async function setReceivableDueDate(saleId: string, dueDate: string): Promise<void> {
  await assertFeature('receivables');
  const { supabase, businessId, can } = await getBusinessContext();
  if (!can('debts:write')) throw new Error('Action non autorisée.');

  const { error } = await supabase
    .from('sales')
    .update({ due_date: dueDate })
    .eq('id', saleId)
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);
  revalidatePath('/creances');
  revalidatePath('/dettes');
}

// ── Encaissement ─────────────────────────────────────────────────────────────

/**
 * Motif d'un encaissement refusé — dans tous les cas, RIEN n'a été écrit.
 * Renvoyé plutôt que levé : en production, Next masque le message d'une
 * exception levée par une action.
 */
export type ReceivableRefusal =
  | 'forbidden'        // rôle sans le droit d'encaisser
  | 'invalid_amount'   // montant absent, nul ou négatif
  | 'exceeds_balance'  // plus que le reste dû : refusé, jamais plafonné en silence
  | 'not_found'        // vente supprimée ou d'une autre entreprise
  | 'already_settled'  // double clic, autre onglet
  | 'cancelled'        // vente annulée ou remboursée
  | 'changed';         // la vente a bougé entre la lecture et l'écriture

export type ReceivablePaymentResult =
  | { settled: true;  amount: number; currency: 'HTG' | 'USD'; balanceDue: number; fullyPaid: boolean }
  | { settled: false; reason: ReceivableRefusal; balanceDue?: number; currency?: 'HTG' | 'USD' };

type ReceivablePaymentMethod = 'Cash' | 'MonCash' | 'Natcash' | 'Card' | 'Virement' | 'Chèque';

function round2(n: number): number {
  return parseFloat(n.toFixed(2));
}

/**
 * Le cœur d'un versement sur une vente à crédit, trace dans `sale_payments`.
 *
 * `requested` = montant versé, ou 'rest' pour le reste dû. Le reste dû est lu
 * ICI, côté serveur (total − déjà payé, la règle de v_receivables.balance_due) :
 * le montant affiché dans le navigateur peut dater d'avant un autre versement.
 */
async function collectOnSale(
  ctx: Awaited<ReturnType<typeof getBusinessContext>>,
  saleId: string,
  requested: number | 'rest',
  paymentMethod: ReceivablePaymentMethod,
): Promise<ReceivablePaymentResult> {
  const { supabase, businessId, userId } = ctx;

  const { data: sale, error: sErr } = await supabase
    .from('sales')
    .select('id, total_amount, paid_amount, payment_status, currency, exchange_rate, invoice_number, customer_name')
    .eq('id', saleId)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .maybeSingle();

  if (sErr) throw new Error(sErr.message);
  if (!sale) return { settled: false, reason: 'not_found' };

  if (sale.payment_status === 'cancelled' || sale.payment_status === 'refunded') {
    return { settled: false, reason: 'cancelled' };
  }

  const total     = Number(sale.total_amount ?? 0);
  const alreadyIn = Number(sale.paid_amount ?? 0);
  const rest      = round2(Math.max(total - alreadyIn, 0));
  const currency  = (sale.currency ?? 'HTG') as 'HTG' | 'USD';

  if (sale.payment_status === 'paid' || rest < 0.01) {
    return { settled: false, reason: 'already_settled' };
  }

  const amount = requested === 'rest' ? rest : round2(requested);
  if (!(amount >= 0.01)) return { settled: false, reason: 'invalid_amount' };
  // Refus plutôt que plafond : encaisser moins que ce que le marchand a tapé
  // ferait diverger sa caisse physique de la caisse du logiciel.
  if (amount > rest) return { settled: false, reason: 'exceeds_balance', balanceDue: rest, currency };

  const fullyPaid  = rest - amount < 0.01;
  const newPaid    = fullyPaid ? total : round2(alreadyIn + amount);
  const newStatus  = fullyPaid ? 'paid' : 'partial';
  const balanceDue = fullyPaid ? 0 : round2(rest - amount);

  // 1. Verrou AVANT toute écriture : la vente ne change que si elle est encore
  //    exactement dans l'état lu ci-dessus. Un UPDATE conditionnel est une seule
  //    instruction SQL : de deux clics simultanés, un seul trouve la ligne ;
  //    l'autre repart avec 'changed' sans avoir inséré de versement.
  let claim = supabase
    .from('sales')
    .update({ paid_amount: newPaid, payment_status: newStatus })
    .eq('id', saleId)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .eq('total_amount', sale.total_amount);
  claim = sale.paid_amount === null
    ? claim.is('paid_amount', null)
    : claim.eq('paid_amount', sale.paid_amount);
  claim = sale.payment_status === null
    ? claim.is('payment_status', null)
    : claim.eq('payment_status', sale.payment_status);
  const { data: claimed, error: claimErr } = await claim.select('id');
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed?.length) return { settled: false, reason: 'changed' };

  // 2. Trace du versement. Son id est la clé d'idempotence de l'écriture.
  const { data: payment, error: pErr } = await supabase
    .from('sale_payments')
    .insert({
      sale_id:        saleId,
      business_id:    businessId,
      amount,
      currency,
      payment_method: paymentMethod,
      notes:          fullyPaid ? 'Solde de créance' : 'Acompte sur créance',
      received_by:    userId,
    })
    .select('id')
    .single();

  if (pErr || !payment) {
    // Versement non tracé : la vente redevient due, telle qu'elle a été lue —
    // seulement si elle est encore dans l'état que nous venons d'écrire.
    await supabase
      .from('sales')
      .update({ paid_amount: sale.paid_amount, payment_status: sale.payment_status })
      .eq('id', saleId)
      .eq('business_id', businessId)
      .eq('paid_amount', newPaid)
      .eq('payment_status', newStatus);
    throw new Error(pErr?.message ?? 'Versement non enregistré.');
  }

  // 3. Déclencheur hérité trg_sale_payment_update (20260526_complete_schema_v2) :
  //    s'il tourne encore, il vient de réécrire paid_amount = SUM(sale_payments),
  //    ce qui oublie tout ce qui a été payé hors de cette table (acompte en
  //    caisse, règlement /dettes) et ferait réclamer deux fois le même argent.
  //    On rétablit notre état, sous condition, pour ne rien écraser d'autre.
  const { data: after } = await supabase
    .from('sales')
    .select('paid_amount, payment_status')
    .eq('id', saleId)
    .eq('business_id', businessId)
    .maybeSingle();
  if (after && (Math.abs(Number(after.paid_amount ?? 0) - newPaid) >= 0.005 || after.payment_status !== newStatus)) {
    const { data: restored } = await supabase
      .from('sales')
      .update({ paid_amount: newPaid, payment_status: newStatus })
      .eq('id', saleId)
      .eq('business_id', businessId)
      .eq('paid_amount', after.paid_amount)
      .eq('payment_status', after.payment_status)
      .select('id');
    if (!restored?.length) {
      console.error('[receivables] vente modifiée pendant le versement', saleId, payment.id);
    }
  }

  // 4. Journal : la caisse (ou la banque) entre, la créance 4110 s'éteint, du
  //    montant de CE versement. Non bloquant : un échec est noté dans
  //    journal_posting_failures par postEvent, l'argent reste encaissé.
  await recordSalePaymentEntry({
    saleId,
    amount,
    date:          new Date().toISOString().split('T')[0],
    currency,
    paymentMethod,
    // Même taux que l'écriture de la vente (sales.ts), sinon la créance en
    // monnaie de base ne s'éteint pas du bon montant.
    exchangeRate:  currency === 'USD' ? Number(sale.exchange_rate ?? 1) || 1 : 1,
    label:         sale.invoice_number ?? `Vant #${saleId.slice(0, 8)}`,
    // Clé propre au versement : un 2e acompte poste sa propre écriture au lieu
    // d'être avalé comme doublon du 1er.
    settlementId:  payment.id,
  });

  void logActivity({
    action: 'update',
    entity: 'sale',
    entityId: sale.invoice_number ?? saleId,
    newValues: { paiement: amount, reste: balanceDue, client: sale.customer_name },
  });

  revalidatePath('/creances');
  revalidatePath('/dettes');
  revalidatePath('/customers');
  revalidatePath('/dashboard');
  revalidatePath('/rapports/comptabilite');

  return { settled: true, amount, currency, balanceDue, fullyPaid };
}

/**
 * Encaisse un acompte (ou le solde exact) sur une créance.
 * Refuse un montant supérieur au reste dû lu côté serveur.
 */
export async function recordReceivablePayment(
  saleId: string,
  amount: number,
  paymentMethod: ReceivablePaymentMethod = 'Cash',
): Promise<ReceivablePaymentResult> {
  await assertFeature('receivables');
  const ctx = await getBusinessContext();
  if (!ctx.can('debts:write')) return { settled: false, reason: 'forbidden' };
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return { settled: false, reason: 'invalid_amount' };
  }

  return collectOnSale(ctx, saleId, amount, paymentMethod);
}

/**
 * « Tout est payé » : encaisse le reste dû, lu côté serveur.
 *
 * Vente rattachée à un client : délègue à markCustomerCreditPaid (même verrou,
 * trace customer_transactions, crédit client, journal) — un seul chemin de
 * solde pour /creances, /dettes et /customers. Vente sans client : la trace
 * customer_transactions exige un customer_id, on solde donc par le cœur
 * ci-dessus (trace sale_payments).
 */
export async function markReceivablePaid(saleId: string): Promise<ReceivablePaymentResult> {
  await assertFeature('receivables');
  const ctx = await getBusinessContext();
  if (!ctx.can('debts:write')) return { settled: false, reason: 'forbidden' };

  const { data: sale, error } = await ctx.supabase
    .from('sales')
    .select('customer_id')
    .eq('id', saleId)
    .eq('business_id', ctx.businessId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!sale) return { settled: false, reason: 'not_found' };

  if (!sale.customer_id) return collectOnSale(ctx, saleId, 'rest', 'Cash');

  const res = await markCustomerCreditPaid(saleId);
  return res.settled
    ? { settled: true, amount: res.amount, currency: res.currency, balanceDue: 0, fullyPaid: true }
    : res;
}

/**
 * Prépare une relance : message prêt à envoyer + lien WhatsApp.
 * L'envoi reste un geste du marchand — on journalise l'intention.
 */
export async function prepareReceivableReminder(saleId: string): Promise<{
  message: string;
  whatsappUrl: string;
  customerName: string;
  hasPhone: boolean;
}> {
  await assertFeature('receivable_reminders');
  const { supabase, businessId, userId } = await getBusinessContext();

  const [{ data: row, error }, { data: biz }] = await Promise.all([
    supabase
      .from('v_receivables')
      .select('*')
      .eq('business_id', businessId)
      .eq('sale_id', saleId)
      .maybeSingle(),
    supabase.from('businesses').select('name').eq('id', businessId).maybeSingle(),
  ]);

  if (error) throw new Error(error.message);
  if (!row) throw new Error('Créance introuvable.');

  const r = mapRow(row);
  const message = buildReminderMessage({
    businessName:  biz?.name ?? 'ProfitPilot',
    clientName:    r.customerName,
    amount:        r.balanceDue,
    currency:      r.currency,
    dueDate:       r.dueDate,
    daysOverdue:   r.daysOverdue,
    invoiceNumber: r.invoiceNumber,
  });

  await supabase.from('receivable_reminders').insert({
    sale_id:     saleId,
    business_id: businessId,
    channel:     'whatsapp',
    message,
    sent_by:     userId,
  });

  await supabase
    .from('sales')
    .update({
      last_reminder_at: new Date().toISOString(),
      reminder_count:   r.reminderCount + 1,
    })
    .eq('id', saleId)
    .eq('business_id', businessId);

  revalidatePath('/creances');

  return {
    message,
    whatsappUrl:  buildWhatsAppLink(r.customerPhone, message),
    customerName: r.customerName,
    hasPhone:     Boolean(r.customerPhone),
  };
}
