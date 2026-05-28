'use server';

import { supabaseServer } from '../../lib/supabaseServerClient';
import { revalidatePath } from 'next/cache';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SupplierUpsertPayload = {
  id?: string;           // present → UPDATE, absent → INSERT
  name: string;
  email?: string;
  phone?: string;
  discount_percent?: number;
  owner_id?: string;     // required for INSERT
};

// ── upsertSupplier ────────────────────────────────────────────────────────────

export async function upsertSupplier(payload: SupplierUpsertPayload): Promise<void> {
  if (!payload.name?.trim()) throw new Error('Le nom du fournisseur est obligatoire.');

  const fields = {
    name:             payload.name.trim(),
    email:            payload.email?.trim()  || null,
    phone:            payload.phone?.trim()  || null,
    discount_percent: payload.discount_percent ?? 0,
  };

  if (payload.id) {
    // UPDATE
    const { error } = await supabaseServer
      .from('suppliers')
      .update(fields)
      .eq('id', payload.id);
    if (error) throw new Error(error.message);
  } else {
    // INSERT
    if (!payload.owner_id) throw new Error('owner_id manquant.');
    const { error } = await supabaseServer
      .from('suppliers')
      .insert({ ...fields, owner_id: payload.owner_id });
    if (error) throw new Error(error.message);
  }

  revalidatePath('/suppliers');
}

// ── deleteSupplier ────────────────────────────────────────────────────────────

export async function deleteSupplier(supplierId: string): Promise<void> {
  const { error } = await supabaseServer
    .from('suppliers')
    .delete()
    .eq('id', supplierId);

  if (error) throw new Error(error.message);

  revalidatePath('/suppliers');
  revalidatePath('/dettes');
}

// ── markPurchasePaid ──────────────────────────────────────────────────────────

export async function markPurchasePaid(purchaseId: string): Promise<void> {
  // 1) Mark purchase as paid
  const { error } = await supabaseServer
    .from('purchases')
    .update({ payment_status: 'Payé' })
    .eq('id', purchaseId);

  if (error) throw new Error(error.message);

  // 2) Create expense record for the payment (same logic as paid-at-purchase-time)
  const { data: purchase, error: fetchErr } = await supabaseServer
    .from('purchases')
    .select('owner_id, total_purchase_amount, purchase_date, supplier_id')
    .eq('id', purchaseId)
    .single();

  if (!fetchErr && purchase) {
    const { data: supplier } = await supabaseServer
      .from('suppliers')
      .select('name')
      .eq('id', purchase.supplier_id)
      .single();

    await supabaseServer.from('expenses').insert({
      owner_id:    purchase.owner_id,
      amount:      purchase.total_purchase_amount,
      description: `Règlement dette — ${supplier?.name ?? 'Fournisseur'}`,
      category:    'Remboursements',
      date:        purchase.purchase_date,
    });
  }

  revalidatePath('/suppliers');
  revalidatePath('/dettes');
}
