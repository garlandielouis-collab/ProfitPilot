'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';

// CRM customers → stored in the `clients` table (name, phone, email, total_credit).
// The e-commerce `customers` table has a different schema (first_name/last_name, no name, no balance).

export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  outstanding_balance: number;
};

export async function getCustomers(): Promise<Customer[]> {
  const { supabase, userId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('clients')
    .select('id, name, phone, email, total_credit')
    .eq('owner_id', userId)
    .order('name', { ascending: true });

  if (error) { console.error('[getCustomers]', error.message); return []; }
  return (data ?? []).map((r: any) => ({
    id:                  r.id,
    name:                r.name,
    phone:               r.phone ?? null,
    email:               r.email ?? null,
    outstanding_balance: Number(r.total_credit ?? 0),
  }));
}

export async function upsertCustomer(payload: {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
}): Promise<Customer> {
  const { supabase, userId } = await getBusinessContext();

  const record = {
    name:     payload.name.trim(),
    phone:    payload.phone?.trim() || null,
    email:    payload.email?.trim() || null,
    owner_id: userId,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from('clients')
      .update({ name: record.name, phone: record.phone, email: record.email })
      .eq('id', payload.id)
      .eq('owner_id', userId)
      .select('id, name, phone, email, total_credit')
      .single();
    if (error) throw new Error(error.message);
    return { ...data, outstanding_balance: Number((data as any).total_credit ?? 0) } as Customer;
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({ ...record, total_credit: 0 })
    .select('id, name, phone, email, total_credit')
    .single();
  if (error) throw new Error(error.message);
  return { ...(data as any), outstanding_balance: 0 } as Customer;
}

export async function deleteCustomer(customerId: string): Promise<void> {
  const { supabase, userId } = await getBusinessContext();

  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', customerId)
    .eq('owner_id', userId);

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
    const { data: client } = await supabase
      .from('clients')
      .select('total_credit')
      .eq('id', tx.customer_id)
      .single();

    if (client) {
      const newBalance = Math.max(0, (Number((client as any).total_credit) ?? 0) - tx.amount);
      await supabase
        .from('clients')
        .update({ total_credit: newBalance })
        .eq('id', tx.customer_id);
    }
  }

  revalidatePath('/clients');
}
