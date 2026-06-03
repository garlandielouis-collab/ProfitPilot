'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';
import { recordExpenseEntry } from './accounting';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExpensePayload = {
  id?: string;
  description: string;
  category: string;          // UI text — mapped to category_id
  amount: number;
  currency: 'HTG' | 'USD';
  payment_status: 'Payé' | 'En attente' | 'Dette';
  payment_method?: string;
  date: string;              // YYYY-MM-DD
  supplier_id?: string;
};

// Map UI payment status → DB enum
const STATUS_MAP: Record<string, string> = {
  'Payé':       'paid',
  'En attente': 'pending',
  'Dette':      'credit',
};

// Map UI payment method → DB enum
const METHOD_MAP: Record<string, string> = {
  'Espèces': 'Cash', 'Cash': 'Cash',
  'Mobile':   'MonCash',
  'Moncash':  'MonCash', 'MonCash': 'MonCash',
  'Natcash':  'Natcash',
  'Carte':    'Card',   'Carte Visa': 'Card', 'Card': 'Card',
  'Virement': 'Virement', 'Chèque': 'Chèque',
};

// ── findOrCreateCategory ──────────────────────────────────────────────────────

async function findOrCreateCategory(
  supabase: any,
  businessId: string,
  userId: string,
  name: string
): Promise<string | null> {
  if (!name?.trim()) return null;

  // Try to find existing
  const { data: existing } = await supabase
    .from('expense_categories')
    .select('id')
    .eq('business_id', businessId)
    .ilike('name', name.trim())
    .maybeSingle();

  if (existing?.id) return existing.id;

  // Create new
  const { data: created, error } = await supabase
    .from('expense_categories')
    .insert({ business_id: businessId, name: name.trim() })
    .select('id')
    .single();

  if (error) {
    console.error('[findOrCreateCategory]', error.message);
    return null;
  }
  return created.id;
}

// ── upsertExpense ─────────────────────────────────────────────────────────────

export async function upsertExpense(payload: ExpensePayload): Promise<void> {
  if (!payload.description?.trim()) throw new Error('Deskripsyon obligatwa.');
  if (!payload.amount || payload.amount <= 0) throw new Error('Montan pa valab.');

  const { supabase, businessId, userId } = await getBusinessContext();

  const categoryId = await findOrCreateCategory(supabase, businessId, userId, payload.category);

  // Generate expense number app-side (avoid fn_generate_ref sequence permission)
  const year   = new Date().getFullYear();
  const rand   = Math.floor(Math.random() * 900000) + 100000;
  const expNum = `EXP-${year}-${rand}`;

  const dbStatus = STATUS_MAP[payload.payment_status]  ?? 'paid';
  const dbMethod = payload.payment_method
    ? (METHOD_MAP[payload.payment_method] ?? null)
    : null;

  const fields: Record<string, unknown> = {
    description:    payload.description.trim(),
    category_id:    categoryId,
    amount:         payload.amount,
    currency:       payload.currency       ?? 'HTG',
    payment_status: dbStatus,
    payment_method: dbMethod,
    expense_date:   payload.date,
    supplier_id:    payload.supplier_id    || null,
    created_by:     userId,
  };

  if (payload.id) {
    const { error } = await supabase
      .from('expenses')
      .update(fields)
      .eq('id', payload.id)
      .eq('business_id', businessId);
    if (error) throw new Error(error.message);
    try {
      await recordExpenseEntry({
        expenseId: payload.id,
        description: payload.description.trim(),
        amount: payload.amount,
        categoryName: payload.category,
        date: payload.date,
        currency: payload.currency ?? 'HTG',
        paymentMethod: dbMethod ?? 'Cash',
      });
    } catch (err) {
      console.error('[accounting] recordExpenseEntry failed on update:', (err as Error).message);
    }
  } else {
    const { data: created, error } = await supabase
      .from('expenses')
      .insert({ ...fields, business_id: businessId, expense_number: expNum })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    try {
      await recordExpenseEntry({
        expenseId: created.id,
        description: payload.description.trim(),
        amount: payload.amount,
        categoryName: payload.category,
        date: payload.date,
        currency: payload.currency ?? 'HTG',
        paymentMethod: dbMethod ?? 'Cash',
      });
    } catch (error) {
      console.error('[accounting] recordExpenseEntry failed:', (error as Error).message);
    }
  }

  revalidatePath('/expenses');
}

// ── deleteExpense ─────────────────────────────────────────────────────────────

export async function deleteExpense(expenseId: string): Promise<void> {
  const { supabase, businessId } = await getBusinessContext();

  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', expenseId)
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);
  revalidatePath('/expenses');
}

// ── getExpenses ───────────────────────────────────────────────────────────────

export async function getExpenses() {
  const { supabase, businessId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('expenses')
    .select(`
      id, description, amount, currency,
      payment_status, payment_method,
      expense_date, supplier_id,
      expense_categories ( name )
    `)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false });

  if (error) throw new Error(error.message);

  // Normalize to match UI expectations
  const STATUS_REVERSE: Record<string, string> = {
    'paid': 'Payé', 'pending': 'En attente', 'credit': 'Dette',
  };

  return (data ?? []).map((r: any) => ({
    id:             r.id,
    description:    r.description,
    category:       r.expense_categories?.name ?? '—',
    amount:         Number(r.amount),
    currency:       r.currency,
    payment_status: STATUS_REVERSE[r.payment_status] ?? r.payment_status,
    payment_method: r.payment_method ?? '',
    date:           r.expense_date,
    supplier_id:    r.supplier_id ?? null,
  }));
}
