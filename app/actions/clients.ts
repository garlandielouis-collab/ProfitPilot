'use server';

import { supabaseServer } from '../../lib/supabaseServerClient';
import { revalidatePath } from 'next/cache';

export type Client = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  total_credit: number;
};

export async function getClients(): Promise<Client[]> {
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabaseServer
    .from('clients')
    .select('id,name,phone,email,total_credit')
    .eq('owner_id', user.id)
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
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) throw new Error('Non authentifié.');

  const record = {
    name: payload.name.trim(),
    phone: payload.phone?.trim() || null,
    email: payload.email?.trim() || null,
    owner_id: user.id,
  };

  if (payload.id) {
    const { data, error } = await supabaseServer
      .from('clients')
      .update(record)
      .eq('id', payload.id)
      .select('id,name,phone,email,total_credit')
      .single();
    if (error) throw new Error(error.message);
    return data as Client;
  }

  const { data, error } = await supabaseServer
    .from('clients')
    .insert({ ...record, total_credit: 0 })
    .select('id,name,phone,email,total_credit')
    .single();
  if (error) throw new Error(error.message);
  return data as Client;
}

export async function deleteClient(clientId: string): Promise<void> {
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) throw new Error('Non authentifié.');

  const { error } = await supabaseServer
    .from('clients')
    .delete()
    .eq('id', clientId)
    .eq('owner_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/clients');
}

export async function markClientCreditPaid(creditId: string): Promise<void> {
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) throw new Error('Non authentifié.');

  const { data: credit, error: fetchErr } = await supabaseServer
    .from('client_credits')
    .select('client_id,amount')
    .eq('id', creditId)
    .eq('owner_id', user.id)
    .single();

  if (fetchErr || !credit) throw new Error('Créance introuvable.');

  const { error: updateErr } = await supabaseServer
    .from('client_credits')
    .update({ payment_status: 'Payé' })
    .eq('id', creditId);

  if (updateErr) throw new Error(updateErr.message);

  // Reduce client total_credit
  if (credit.client_id) {
    const { data: client } = await supabaseServer
      .from('clients')
      .select('total_credit')
      .eq('id', credit.client_id)
      .single();

    if (client) {
      const newCredit = Math.max(0, (client.total_credit ?? 0) - credit.amount);
      await supabaseServer
        .from('clients')
        .update({ total_credit: newCredit })
        .eq('id', credit.client_id);
    }
  }
}
