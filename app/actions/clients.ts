'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';

export type Client = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  outstanding_balance: number;
};

export async function getClients(): Promise<Client[]> {
  const { supabase, businessId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('customers')
    .select('id,name,phone,email,outstanding_balance')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) { console.error('[getClients]', error.message); return []; }
  return (data ?? []) as Client[];
}

export async function upsertClient(payload: {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
}): Promise<Client> {
  const { supabase, businessId, userId } = await getBusinessContext();

  const record = {
    name:        payload.name.trim(),
    phone:       payload.phone?.trim() || null,
    email:       payload.email?.trim() || null,
    business_id: businessId,
    created_by:  userId,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from('customers')
      .update({ name: record.name, phone: record.phone, email: record.email })
      .eq('id', payload.id)
      .eq('business_id', businessId)
      .select('id,name,phone,email,outstanding_balance')
      .single();
    if (error) throw new Error(error.message);
    return data as Client;
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({ ...record, outstanding_balance: 0 })
    .select('id,name,phone,email,outstanding_balance')
    .single();
  if (error) throw new Error(error.message);
  return data as Client;
}

export async function deleteClient(clientId: string): Promise<void> {
  const { supabase, businessId } = await getBusinessContext();

  // Soft delete
  const { error } = await supabase
    .from('customers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', clientId)
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);
  revalidatePath('/clients');
}

async function reduceCustomerBalance(supabase: any, customerId: string, amount: number) {
  const { data: cust } = await supabase
    .from('customers')
    .select('outstanding_balance')
    .eq('id', customerId)
    .single();
  if (cust) {
    const newBalance = Math.max(0, (cust.outstanding_balance ?? 0) - amount);
    await supabase.from('customers').update({ outstanding_balance: newBalance }).eq('id', customerId);
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
