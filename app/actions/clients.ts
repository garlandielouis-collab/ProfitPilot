'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';
import { logActivity } from '../../lib/activityLog';
import { notify } from '../../lib/notify';

export type Client = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  outstanding_balance: number;
};

export async function getClients(): Promise<Client[]> {
  const { supabase, userId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('clients')
    .select('id,name,phone,email,total_credit')
    .eq('owner_id', userId)
    .order('name', { ascending: true });

  if (error) { console.error('[getClients]', error.message); return []; }
  return (data ?? []).map((r: any) => ({ ...r, outstanding_balance: r.total_credit ?? 0 })) as Client[];
}

export async function upsertClient(payload: {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
}): Promise<Client> {
  const { supabase, businessId, userId } = await getBusinessContext();

  const record = {
    name:  payload.name.trim(),
    phone: payload.phone?.trim() || null,
    email: payload.email?.trim() || null,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from('clients')
      .update({ name: record.name, phone: record.phone, email: record.email })
      .eq('id', payload.id)
      .eq('owner_id', userId)
      .select('id,name,phone,email,total_credit')
      .single();
    if (error) throw new Error(error.message);
    void logActivity({ action: 'update', entity: 'client', entityId: payload.id, newValues: record });
    return { ...data, outstanding_balance: data.total_credit ?? 0 } as Client;
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({ name: record.name, phone: record.phone, email: record.email, owner_id: userId, total_credit: 0 })
    .select('id,name,phone,email,total_credit')
    .single();
  if (error) throw new Error(error.message);
  void logActivity({ action: 'create', entity: 'client', entityId: data.id, newValues: { name: record.name } });
  void notify({
    companyId: businessId, triggeredBy: userId,
    type: 'client_created',
    title: `Nouveau client — ${record.name}`,
    body: record.phone ? `Tél : ${record.phone}` : undefined,
    entity: 'client', entityId: data.id,
    data: { name: record.name, phone: record.phone },
  });
  return { ...data, outstanding_balance: data.total_credit ?? 0 } as Client;
}

export async function deleteClient(clientId: string): Promise<void> {
  const { supabase, userId } = await getBusinessContext();

  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', clientId)
    .eq('owner_id', userId);

  if (error) throw new Error(error.message);
  void logActivity({ action: 'delete', entity: 'client', entityId: clientId });
  revalidatePath('/clients');
}

async function reduceCustomerBalance(supabase: any, customerId: string, amount: number) {
  const { data: cust } = await supabase
    .from('clients')
    .select('total_credit')
    .eq('id', customerId)
    .single();
  if (cust) {
    const newBalance = Math.max(0, (cust.total_credit ?? 0) - amount);
    await supabase.from('clients').update({ total_credit: newBalance }).eq('id', customerId);
  }
}

export async function markClientCreditPaid(transactionOrSaleId: string): Promise<void> {
  const { supabase, businessId, userId } = await getBusinessContext();

  // Try as customer_transactions.id first
  const { data: tx } = await supabase
    .from('customer_transactions')
    .select('id,client_id,client_name,sale_id,amount,currency')
    .eq('id', transactionOrSaleId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (tx) {
    const { error: insertErr } = await supabase
      .from('customer_transactions')
      .insert({
        owner_id:   userId,
        business_id: businessId,
        client_id:  tx.client_id,
        client_name: tx.client_name ?? 'Kliyan',
        sale_id:    tx.sale_id,
        type:       'payment',
        amount:     tx.amount,
        currency:   tx.currency ?? 'HTG',
        notes:      'Peman kredi',
      });
    if (insertErr) throw new Error(insertErr.message);

    if (tx.client_id) {
      await reduceCustomerBalance(supabase, tx.client_id, tx.amount);
    }
    revalidatePath('/clients');
    return;
  }

  // Not found — try as sales.id
  const { data: sale } = await supabase
    .from('sales')
    .select('id,customer_id,customer_name,total_amount,currency')
    .eq('id', transactionOrSaleId)
    .maybeSingle();

  if (!sale) throw new Error('Transaction introuvable.');

  await supabase.from('sales').update({ payment_status: 'paid' }).eq('id', sale.id);

  const { error: insertErr } = await supabase
    .from('customer_transactions')
    .insert({
      owner_id:    userId,
      business_id: businessId,
      client_id:   sale.customer_id,
      client_name: sale.customer_name ?? 'Kliyan',
      sale_id:     sale.id,
      type:        'payment',
      amount:      sale.total_amount,
      currency:    sale.currency ?? 'HTG',
      notes:       'Peman kredi depi vant',
    });
  if (insertErr) throw new Error(insertErr.message);

  if (sale.customer_id) {
    await reduceCustomerBalance(supabase, sale.customer_id, sale.total_amount);
  }

  revalidatePath('/clients');
  revalidatePath('/dettes');
}
