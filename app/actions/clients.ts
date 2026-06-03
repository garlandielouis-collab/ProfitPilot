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

export async function markClientCreditPaid(transactionId: string): Promise<void> {
  const { supabase, businessId } = await getBusinessContext();

  // Get the transaction
  const { data: tx, error: fetchErr } = await supabase
    .from('customer_transactions')
    .select('customer_id,amount,balance_after')
    .eq('id', transactionId)
    .eq('business_id', businessId)
    .single();

  if (fetchErr || !tx) throw new Error('Transaction introuvable.');

  // Record a payment transaction (reduces outstanding_balance)
  const { error: insertErr } = await supabase
    .from('customer_transactions')
    .insert({
      business_id:      businessId,
      customer_id:      tx.customer_id,
      transaction_date: new Date().toISOString(),
      type:             'payment',
      amount:           tx.amount,
      currency:         'HTG',
      description:      'Peman kredi',
      reference_type:   'credit_payment',
      reference_id:     transactionId,
    });

  if (insertErr) throw new Error(insertErr.message);

  // Update customer outstanding_balance
  if (tx.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select('outstanding_balance')
      .eq('id', tx.customer_id)
      .single();

    if (cust) {
      const newBalance = Math.max(0, (cust.outstanding_balance ?? 0) - tx.amount);
      await supabase
        .from('customers')
        .update({ outstanding_balance: newBalance })
        .eq('id', tx.customer_id);
    }
  }

  revalidatePath('/clients');
}
