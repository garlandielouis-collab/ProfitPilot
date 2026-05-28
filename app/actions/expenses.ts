'use server';

import { supabaseServer } from '../../lib/supabaseServerClient';
import { revalidatePath } from 'next/cache';

// ── Types ────────────────────────────────────────────────────────────────────

export type ExpensePayload = {
  id?: string;
  owner_id?: string;
  description: string;
  category: string;
  amount: number;
  currency: 'HTG' | 'USD';
  payment_status: 'Payé' | 'En attente' | 'Dette';
  payment_method?: string;
  date: string;
  supplier_id?: string;
};

// ── upsertExpense ─────────────────────────────────────────────────────────────

export async function upsertExpense(payload: ExpensePayload): Promise<void> {
  if (!payload.description?.trim()) throw new Error('Description obligatoire.');
  if (!payload.amount || payload.amount <= 0) throw new Error('Montant invalide.');

  const fields = {
    description:    payload.description.trim(),
    category:       payload.category,
    amount:         payload.amount,
    currency:       payload.currency   ?? 'HTG',
    payment_status: payload.payment_status ?? 'Payé',
    payment_method: payload.payment_method || null,
    date:           payload.date,
    supplier_id:    payload.supplier_id || null,
  };

  if (payload.id) {
    const { error } = await supabaseServer
      .from('expenses')
      .update(fields)
      .eq('id', payload.id);
    if (error) throw new Error(error.message);
  } else {
    if (!payload.owner_id) throw new Error('owner_id manquant.');
    const { error } = await supabaseServer
      .from('expenses')
      .insert({ ...fields, owner_id: payload.owner_id });
    if (error) throw new Error(error.message);
  }

  revalidatePath('/expenses');
}

// ── deleteExpense ─────────────────────────────────────────────────────────────

export async function deleteExpense(expenseId: string): Promise<void> {
  const { error } = await supabaseServer
    .from('expenses')
    .delete()
    .eq('id', expenseId);
  if (error) throw new Error(error.message);
  revalidatePath('/expenses');
}
