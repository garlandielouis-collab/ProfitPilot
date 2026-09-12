'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { recordSalePaymentEntry } from '../../lib/accounting/posting';
import { isExchangeRateSet } from '../../lib/currency';
import { revalidatePath } from 'next/cache';
import { logActivity } from '../../lib/activityLog';
import { notify } from '../../lib/notify';

export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  outstanding_balance: number;
};

export async function getCustomers(): Promise<Customer[]> {
  const { supabase, businessId, userId } = await getBusinessContext();

  if (!businessId) return [];

  const query = supabase.from('customers').select('id,first_name,last_name,phone,email');
  query.eq('business_id', businessId);

  const { data, error } = await query.order('first_name', { ascending: true });

  if (error) { console.error('[getCustomers]', error.message); return []; }
  return (data ?? []).map((r: any) => ({ 
    id: r.id,
    name: `${r.first_name} ${r.last_name}`.trim(),
    phone: r.phone,
    email: r.email,
    outstanding_balance: 0
  })) as Customer[];
}

export async function upsertCustomer(payload: {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
}): Promise<Customer> {
  const { supabase, businessId, userId } = await getBusinessContext();

  if (!businessId) throw new Error('No business context');

  const name = (payload.name ?? '').trim();
  if (!name) throw new Error('Le nom du client est obligatoire.');

  const nameParts = name.split(/\s+/);
  const first_name = nameParts[0] || '';
  const last_name = nameParts.slice(1).join(' ') || '';
  const normalizedPhone = payload.phone?.trim() || null;
  const normalizedEmail = payload.email?.trim() || '';
  const hasEmail = normalizedEmail.length > 0;

  const buildCustomer = (row: any): Customer => ({
    id: row.id,
    name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    phone: row.phone,
    email: row.email ?? null,
    outstanding_balance: 0,
  });

  const buildPlaceholderEmail = () => {
    const baseName = `${first_name}${last_name}`.replace(/[^a-z0-9]+/gi, '').toLowerCase() || 'customer';
    return `no-email-${businessId.replace(/-/g, '')}-${baseName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@profitpilot.local`;
  };

  const findExistingCustomer = async (emailToMatch?: string | null, phoneToMatch?: string | null) => {
    let query = supabase
      .from('customers')
      .select('id,first_name,last_name,phone,email')
      .eq('business_id', businessId);

    if (emailToMatch) {
      query = query.eq('email', emailToMatch);
    } else if (phoneToMatch) {
      query = query.eq('phone', phoneToMatch);
    } else {
      query = query.ilike('first_name', first_name);
      if (last_name) {
        query = query.ilike('last_name', last_name);
      }
    }

    return query.limit(1).maybeSingle();
  };

  if (payload.id) {
    const { data: currentCustomer } = await supabase
      .from('customers')
      .select('id,first_name,last_name,phone,email')
      .eq('id', payload.id)
      .eq('business_id', businessId)
      .maybeSingle();

    const emailForUpdate = hasEmail
      ? normalizedEmail
      : currentCustomer?.email || buildPlaceholderEmail();

    const { data, error } = await supabase
      .from('customers')
      .update({ first_name, last_name, phone: normalizedPhone, email: emailForUpdate })
      .eq('id', payload.id)
      .eq('business_id', businessId)
      .select('id,first_name,last_name,phone,email')
      .single();

    if (error) throw new Error(error.message);
    void logActivity({ action: 'update', entity: 'customer', entityId: payload.id, newValues: { name } });
    return buildCustomer(data);
  }

  const { data: existingCustomer, error: existingError } = await findExistingCustomer(hasEmail ? normalizedEmail : null, normalizedPhone);
  if (!existingError && existingCustomer) {
    return buildCustomer(existingCustomer);
  }

  const emailForInsert = hasEmail ? normalizedEmail : buildPlaceholderEmail();

  const { data, error } = await supabase
    .from('customers')
    .insert({ first_name, last_name, phone: normalizedPhone, email: emailForInsert, business_id: businessId })
    .select('id,first_name,last_name,phone,email')
    .single();

  if (error) {
    const isDuplicateKeyError = error.message?.includes('duplicate key') || error.message?.includes('customers_business_id_email_key');
    if (isDuplicateKeyError) {
      const { data: fallbackCustomer, error: fallbackError } = await findExistingCustomer(emailForInsert, normalizedPhone);
      if (!fallbackError && fallbackCustomer) {
        return buildCustomer(fallbackCustomer);
      }
    }
    throw new Error(error.message);
  }

  void logActivity({ action: 'create', entity: 'customer', entityId: data.id, newValues: { name } });
  void notify({
    companyId: businessId,
    triggeredBy: userId,
    type: 'client_created',
    title: `Nouveau client — ${name}`,
    body: payload.phone ? `Tél : ${payload.phone}` : undefined,
    entity: 'customer',
    entityId: data.id,
    data: { name, phone: payload.phone },
  });

  return buildCustomer(data);
}

export async function deleteCustomer(customerId: string): Promise<void> {
  const { supabase, businessId } = await getBusinessContext();

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', customerId)
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);
  void logActivity({ action: 'delete', entity: 'customer', entityId: customerId });
  revalidatePath('/customers');
}

// Issue d'un encaissement. `settled: false` n'est pas une erreur : rien n'a été
// écrit, parce que la vente était déjà soldée (double clic, autre onglet),
// annulée, ou modifiée entre la lecture et l'écriture. Renvoyé plutôt que levé :
// en production, Next masque le message d'une exception levée par une action.
type CreditSettlement =
  | { settled: true;  amount: number; currency: 'HTG' | 'USD' }
  | { settled: false; reason: 'already_settled' | 'cancelled' | 'changed' };

/**
 * Encaisse le RESTE DÛ d'une vente à crédit : trace le paiement, solde la
 * vente, réduit le crédit cumulé du client et passe l'écriture qui éteint la
 * créance 4110.
 *
 * Le montant est lu ici, côté serveur, au moment du clic : total − déjà payé,
 * la règle de `v_receivables.balance_due`, dans la devise de la vente.
 * Encaisser `total_amount` comptait une seconde fois chaque acompte déjà versé
 * — en trésorerie, au journal et sur le crédit du client.
 *
 * Accepte l'id d'une vente, ou celui d'une ligne customer_transactions
 * rattachée à une vente.
 */
export async function markCustomerCreditPaid(transactionOrSaleId: string): Promise<CreditSettlement> {
  const { supabase, businessId, userId, can, exchangeRate, exchangeRateSet } = await getBusinessContext();
  // Même droit que /creances : encaisser fait entrer de l'argent en caisse et
  // éteint une créance. Une action serveur est appelable par tout membre.
  if (!can('debts:write')) throw new Error('Action non autorisée.');

  // Column names follow the real customer_transactions schema: customer_id /
  // description / reference_type+reference_id — not client_id / sale_id / notes.
  const { data: tx, error: txErr } = await supabase
    .from('customer_transactions')
    .select('id, reference_type, reference_id')
    .eq('id', transactionOrSaleId)
    .eq('business_id', businessId)
    .maybeSingle();
  if (txErr) throw new Error(txErr.message);

  const saleId = tx
    ? (tx.reference_type === 'sale' ? tx.reference_id : null)
    : transactionOrSaleId;

  // Sans vente, aucun reste dû à vérifier : on encaisserait un montant que rien
  // ne borne, rejouable à chaque clic.
  if (!saleId) throw new Error('Transaction non rattachée à une vente : encaissez depuis la vente.');

  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .select('id, customer_id, total_amount, paid_amount, currency, exchange_rate, payment_method, payment_status')
    .eq('id', saleId)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .maybeSingle();

  if (saleErr) throw new Error(saleErr.message);
  if (!sale) throw new Error('Vente introuvable.');

  if (sale.payment_status === 'cancelled' || sale.payment_status === 'refunded') {
    return { settled: false, reason: 'cancelled' };
  }

  const total    = Number(sale.total_amount ?? 0);
  const amount   = parseFloat(Math.max(total - Number(sale.paid_amount ?? 0), 0).toFixed(2));
  const currency = (sale.currency ?? 'HTG') as 'HTG' | 'USD';

  // `payment_status = 'paid'` suffit à dire « soldée » : l'ancien encaissement
  // passait la vente à 'paid' sans toucher paid_amount, et v_receivables la
  // tient déjà pour payée.
  if (sale.payment_status === 'paid' || amount < 0.01) {
    return { settled: false, reason: 'already_settled' };
  }

  // Verrou AVANT toute écriture : la vente ne passe à « payée » que si elle est
  // encore exactement dans l'état lu ci-dessus. Un UPDATE conditionnel est une
  // seule instruction SQL : un 2e clic, ou un acompte arrivé entre-temps, ne
  // trouve plus la ligne et repart sans rien écrire.
  let claim = supabase
    .from('sales')
    .update({ paid_amount: total, payment_status: 'paid' })
    .eq('id', saleId)
    .eq('business_id', businessId)
    .not('payment_status', 'in', '(paid,cancelled,refunded)')
    .eq('total_amount', sale.total_amount);
  claim = sale.paid_amount === null
    ? claim.is('paid_amount', null)
    : claim.eq('paid_amount', sale.paid_amount);
  const { data: claimed, error: claimErr } = await claim.select('id');
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed?.length) return { settled: false, reason: 'changed' };

  const { data: payment, error: insertErr } = await supabase
    .from('customer_transactions')
    .insert({
      business_id:      businessId,
      customer_id:      sale.customer_id,
      transaction_date: new Date().toISOString(),
      type:             'payment',
      amount,
      currency,
      description:      'Peman kredi',
      reference_type:   'sale',
      reference_id:     saleId,
      created_by:       userId,
    })
    .select('id')
    .single();
  if (insertErr) {
    // Paiement non tracé : la vente redevient due, telle qu'elle a été lue.
    await supabase
      .from('sales')
      .update({ paid_amount: sale.paid_amount, payment_status: sale.payment_status })
      .eq('id', saleId)
      .eq('business_id', businessId)
      .eq('payment_status', 'paid');
    throw new Error(insertErr.message);
  }

  // Draw down the running credit that the credit sale added — du montant
  // réellement encaissé, pas du total de la vente.
  if (sale.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select('total_credit')
      .eq('id', sale.customer_id)
      .eq('business_id', businessId)
      .maybeSingle();
    if (cust) {
      const remaining = Math.max(0, Number(cust.total_credit ?? 0) - amount);
      const { error: creditErr } = await supabase
        .from('customers')
        .update({ total_credit: parseFloat(remaining.toFixed(2)) })
        .eq('id', sale.customer_id)
        .eq('business_id', businessId);
      if (creditErr) console.error('[markCustomerCreditPaid] total_credit:', creditErr.message);
    }
  }

  // Taux de l'écriture : celui de la vente s'il a été saisi (> 1) — la créance
  // s'éteint au taux où elle est née, comme dans collectOnSale (receivables.ts)
  // —, sinon celui de l'entreprise s'il est renseigné. Aucun des deux :
  // `undefined`, et postEvent note l'échec d'écriture dans
  // journal_posting_failures au lieu d'écrire à un taux inventé. L'encaissement,
  // lui, reste acquis : l'argent est reçu.
  const entryRate = currency !== 'USD'
    ? 1
    : isExchangeRateSet(sale.exchange_rate)
      ? Number(sale.exchange_rate)
      : (exchangeRateSet ? exchangeRate : undefined);

  // Journal: cash in, receivable 4110 extinguished. Without this the customer
  // debt stayed on the balance sheet forever after being collected.
  await recordSalePaymentEntry({
    saleId,
    amount,
    date:          new Date().toISOString().split('T')[0],
    currency,
    exchangeRate:  entryRate,
    paymentMethod: sale.payment_method ?? undefined,
    label:         `Vant #${String(saleId).slice(0, 8)}`,
    // Keys the entry to this instalment, so a 2nd partial payment on the same
    // sale posts its own entry instead of being swallowed as a duplicate.
    settlementId:  payment.id,
  });

  revalidatePath('/customers');
  revalidatePath('/dettes');
  revalidatePath('/creances');
  revalidatePath('/rapports/comptabilite');

  return { settled: true, amount, currency };
}
