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

/**
 * Encaisse un paiement (total ou partiel) sur une créance.
 * Met à jour `paid_amount` + `payment_status` et trace le paiement.
 */
export async function recordReceivablePayment(
  saleId: string,
  amount: number,
  paymentMethod: 'Cash' | 'MonCash' | 'Natcash' | 'Card' | 'Virement' | 'Chèque' = 'Cash',
): Promise<{ paidAmount: number; balanceDue: number; fullyPaid: boolean }> {
  await assertFeature('receivables');
  const { supabase, businessId, userId, can } = await getBusinessContext();
  if (!can('debts:write')) throw new Error('Action non autorisée.');
  if (!(amount > 0)) throw new Error('Montant invalide.');

  const { data: sale, error: sErr } = await supabase
    .from('sales')
    .select('id, total_amount, paid_amount, currency, invoice_number, customer_name')
    .eq('id', saleId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (sErr) throw new Error(sErr.message);
  if (!sale) throw new Error('Vente introuvable.');

  const total     = Number(sale.total_amount ?? 0);
  const alreadyIn = Number(sale.paid_amount ?? 0);
  const newPaid   = Math.min(alreadyIn + amount, total);
  const balance   = Math.max(total - newPaid, 0);
  const fullyPaid = balance <= 0;

  const { error: pErr } = await supabase.from('sale_payments').insert({
    sale_id:        saleId,
    business_id:    businessId,
    amount,
    currency:       sale.currency ?? 'HTG',
    payment_method: paymentMethod,
    notes:          'Règlement de créance',
    received_by:    userId,
  });
  if (pErr) throw new Error(pErr.message);

  const { error: uErr } = await supabase
    .from('sales')
    .update({
      paid_amount:    newPaid,
      payment_status: fullyPaid ? 'paid' : 'partial',
    })
    .eq('id', saleId)
    .eq('business_id', businessId);
  if (uErr) throw new Error(uErr.message);

  void logActivity({
    action: 'update',
    entity: 'sale',
    entityId: sale.invoice_number ?? saleId,
    newValues: { paiement: amount, reste: balance, client: sale.customer_name },
  });

  revalidatePath('/creances');
  revalidatePath('/dettes');
  revalidatePath('/dashboard');

  return { paidAmount: newPaid, balanceDue: balance, fullyPaid };
}

/** Solde une créance en une fois. */
export async function markReceivablePaid(saleId: string): Promise<void> {
  const { supabase, businessId } = await getBusinessContext();
  const { data: sale } = await supabase
    .from('sales')
    .select('total_amount, paid_amount')
    .eq('id', saleId)
    .eq('business_id', businessId)
    .maybeSingle();

  const rest = Math.max(Number(sale?.total_amount ?? 0) - Number(sale?.paid_amount ?? 0), 0);
  if (rest > 0) await recordReceivablePayment(saleId, rest);
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
