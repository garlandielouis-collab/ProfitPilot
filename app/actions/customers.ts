'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { recordSalePaymentEntry } from '../../lib/accounting/posting';
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

async function rollbackCustomerPayment(supabase: any, paymentId: string) {
  await supabase.from('customer_transactions').delete().eq('id', paymentId);
}

/**
 * Settles a customer's credit: records the payment, closes the sale, draws down
 * the customer's running credit, and posts the journal entry that extinguishes
 * the 4110 receivable.
 *
 * Accepts either a customer_transactions id or a sales id.
 */
export async function markCustomerCreditPaid(transactionOrSaleId: string): Promise<void> {
  const { supabase, businessId, userId } = await getBusinessContext();

  // Column names follow the real customer_transactions schema: customer_id /
  // description / reference_type+reference_id — not client_id / sale_id / notes.
  const { data: tx } = await supabase
    .from('customer_transactions')
    .select('id, customer_id, amount, currency, reference_type, reference_id')
    .eq('id', transactionOrSaleId)
    .eq('business_id', businessId)
    .maybeSingle();

  // Resolve the underlying sale in both entry paths, so the journal always has
  // a document to attach the settlement to.
  const saleId = tx
    ? (tx.reference_type === 'sale' ? tx.reference_id : null)
    : transactionOrSaleId;

  let customerId = tx?.customer_id ?? null;
  let amount     = tx ? Number(tx.amount) : 0;
  let currency   = (tx?.currency ?? 'HTG') as 'HTG' | 'USD';
  let paymentMethod: string | undefined;

  if (!tx) {
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .select('id, customer_id, total_amount, currency, payment_method')
      .eq('id', transactionOrSaleId)
      .eq('business_id', businessId)
      .maybeSingle();

    if (saleErr) throw new Error(saleErr.message);
    if (!sale) throw new Error('Transaction introuvable.');

    customerId    = sale.customer_id;
    amount        = Number(sale.total_amount);
    currency      = (sale.currency ?? 'HTG') as 'HTG' | 'USD';
    paymentMethod = sale.payment_method ?? undefined;
  }

  const { data: payment, error: insertErr } = await supabase
    .from('customer_transactions')
    .insert({
      business_id:      businessId,
      customer_id:      customerId,
      transaction_date: new Date().toISOString(),
      type:             'payment',
      amount,
      currency,
      description:      'Peman kredi',
      reference_type:   saleId ? 'sale' : null,
      reference_id:     saleId,
      created_by:       userId,
    })
    .select('id')
    .single();
  if (insertErr) throw new Error(insertErr.message);

  if (saleId) {
    const { error: updateSaleErr } = await supabase
      .from('sales')
      .update({ payment_status: 'paid' })
      .eq('id', saleId)
      .eq('business_id', businessId);
    if (updateSaleErr) {
      await rollbackCustomerPayment(supabase, payment.id);
      throw new Error(updateSaleErr.message);
    }
  }

  // Draw down the running credit that the credit sale added.
  if (customerId) {
    const { data: cust } = await supabase
      .from('customers')
      .select('total_credit')
      .eq('id', customerId)
      .maybeSingle();
    if (cust) {
      const remaining = Math.max(0, Number(cust.total_credit ?? 0) - amount);
      await supabase
        .from('customers')
        .update({ total_credit: parseFloat(remaining.toFixed(2)) })
        .eq('id', customerId);
    }
  }

  // Journal: cash in, receivable 4110 extinguished. Without this the customer
  // debt stayed on the balance sheet forever after being collected.
  if (saleId) {
    await recordSalePaymentEntry({
      saleId,
      amount,
      date:          new Date().toISOString().split('T')[0],
      currency,
      paymentMethod,
      label:         `Vant #${String(saleId).slice(0, 8)}`,
      // Keys the entry to this instalment, so a 2nd partial payment on the same
      // sale posts its own entry instead of being swallowed as a duplicate.
      settlementId:  payment.id,
    });
  }

  revalidatePath('/customers');
  revalidatePath('/dettes');
  revalidatePath('/rapports/comptabilite');
}
