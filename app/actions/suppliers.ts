'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SupplierUpsertPayload = {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  discount_percent?: number;
};

// ── upsertSupplier ────────────────────────────────────────────────────────────

export async function upsertSupplier(payload: SupplierUpsertPayload): Promise<void> {
  if (!payload.name?.trim()) throw new Error('Non founisè a obligatwa.');
  const { supabase, businessId, userId } = await getBusinessContext();

  const fields = {
    name:             payload.name.trim(),
    email:            payload.email?.trim()  || null,
    phone:            payload.phone?.trim()  || null,
    discount_percent: payload.discount_percent ?? 0,
  };

  if (payload.id) {
    const { error } = await supabase
      .from('suppliers')
      .update(fields)
      .eq('id', payload.id)
      .eq('business_id', businessId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from('suppliers')
      .insert({ ...fields, business_id: businessId, created_by: userId });
    if (error) throw new Error(error.message);
  }

  revalidatePath('/suppliers');
}

// ── deleteSupplier ────────────────────────────────────────────────────────────

export async function deleteSupplier(supplierId: string): Promise<void> {
  const { supabase, businessId } = await getBusinessContext();

  const { error } = await supabase
    .from('suppliers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', supplierId)
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);

  revalidatePath('/suppliers');
  revalidatePath('/dettes');
}

// ── markPurchasePaid ──────────────────────────────────────────────────────────

export async function markPurchasePaid(purchaseId: string): Promise<void> {
  const { supabase, businessId, userId } = await getBusinessContext();

  // 1. Get purchase
  const { data: purchase, error: fetchErr } = await supabase
    .from('purchases')
    .select('supplier_id, total_amount, payment_status, currency')
    .eq('id', purchaseId)
    .eq('business_id', businessId)
    .single();

  if (fetchErr || !purchase) throw new Error('Acha pa jwenn.');
  if (purchase.payment_status === 'paid') throw new Error('Acha sa a deja peye.');

  const total = Number(purchase.total_amount);

  // 2. Mark purchase as paid
  const { error: updErr } = await supabase
    .from('purchases')
    .update({ payment_status: 'paid', paid_amount: total })
    .eq('id', purchaseId);

  if (updErr) throw new Error(updErr.message);

  // 3. Update supplier outstanding_balance
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('outstanding_balance, name')
    .eq('id', purchase.supplier_id)
    .single();

  const balBefore  = Number(supplier?.outstanding_balance ?? 0);
  const balAfter   = Math.max(0, balBefore - total);

  await supabase
    .from('suppliers')
    .update({ outstanding_balance: balAfter })
    .eq('id', purchase.supplier_id);

  // 4. Record supplier transaction
  await supabase.from('supplier_transactions').insert({
    business_id:      businessId,
    supplier_id:      purchase.supplier_id,
    transaction_date: new Date().toISOString(),
    type:             'payment',
    amount:           total,
    currency:         purchase.currency ?? 'HTG',
    description:      `Règleman dèt — acha #${purchaseId.slice(0, 8)}`,
    reference_type:   'purchase',
    reference_id:     purchaseId,
    balance_before:   balBefore,
    balance_after:    balAfter,
    created_by:       userId,
  });

  revalidatePath('/suppliers');
  revalidatePath('/dettes');
  revalidatePath('/purchases');
}
