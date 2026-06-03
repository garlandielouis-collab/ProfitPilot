'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';

export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  outstanding_balance: number;
};

export async function getCustomers(): Promise<Customer[]> {
  const { supabase, businessId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('customers')
    .select('id,name,phone,email,outstanding_balance')
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) { console.error('[getCustomers]', error.message); return []; }
  return (data ?? []) as Customer[];
}

export async function upsertCustomer(payload: {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
}): Promise<Customer> {
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
    return data as Customer;
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({ ...record, outstanding_balance: 0 })
    .select('id,name,phone,email,outstanding_balance')
    .single();
  if (error) throw new Error(error.message);
  return data as Customer;
}

export async function deleteCustomer(customerId: string): Promise<void> {
  const { supabase, businessId } = await getBusinessContext();

  const { error } = await supabase
    .from('customers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', customerId)
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);
  revalidatePath('/clients');
}

export async function markCustomerCreditPaid(creditId: string): Promise<void> {
  const { supabase, businessId } = await getBusinessContext();

  const { data: tx, error: fetchErr } = await supabase
    .from('customer_transactions')
    .select('customer_id,amount')
    .eq('id', creditId)
    .eq('business_id', businessId)
    .single();

  if (fetchErr || !tx) throw new Error('Transaction introuvable.');

  if (tx.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('outstanding_balance')
      .eq('id', tx.customer_id)
      .single();

    if (customer) {
      const newBalance = Math.max(0, (customer.outstanding_balance ?? 0) - tx.amount);
      await supabase
        .from('customers')
        .update({ outstanding_balance: newBalance })
        .eq('id', tx.customer_id);
    }
  }

  revalidatePath('/clients');
}
