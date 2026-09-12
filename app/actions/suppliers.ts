'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { recordPurchasePaymentEntry } from '../../lib/accounting/posting';
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

// Issue d'un règlement. `settled: false` n'est pas une erreur : rien n'a été
// écrit, parce que l'achat était déjà payé (double clic, autre onglet), annulé,
// ou modifié entre la lecture et l'écriture. Renvoyé plutôt que levé : en
// production, Next masque le message d'une exception levée par une action.
type PurchaseSettlement =
  | { settled: true;  amount: number; currency: 'HTG' | 'USD' }
  | { settled: false; reason: 'already_settled' | 'cancelled' | 'changed' };

/**
 * Règle le RESTE DÛ d'un achat à crédit (total − déjà payé), lu ici au moment
 * du clic, dans la devise de l'achat. Régler `total_amount` décaissait une
 * seconde fois tout acompte déjà versé au fournisseur — en trésorerie comme au
 * journal.
 */
export async function markPurchasePaid(purchaseId: string): Promise<PurchaseSettlement> {
  const { supabase, businessId, userId } = await getBusinessContext();

  // 1. Get purchase
  const { data: purchase, error: fetchErr } = await supabase
    .from('purchases')
    .select('supplier_id, total_amount, paid_amount, payment_status, currency')
    .eq('id', purchaseId)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!purchase) throw new Error('Acha pa jwenn.');
  if (purchase.payment_status === 'cancelled' || purchase.payment_status === 'refunded') {
    return { settled: false, reason: 'cancelled' };
  }

  const total    = Number(purchase.total_amount ?? 0);
  const amount   = parseFloat(Math.max(total - Number(purchase.paid_amount ?? 0), 0).toFixed(2));
  const currency = (purchase.currency ?? 'HTG') as 'HTG' | 'USD';

  if (purchase.payment_status === 'paid' || amount < 0.01) {
    return { settled: false, reason: 'already_settled' };
  }

  // 2. Mark purchase as paid — verrou AVANT toute écriture : l'achat ne passe
  //    à « payé » que s'il est encore exactement dans l'état lu ci-dessus. Un
  //    UPDATE conditionnel est une seule instruction SQL : un 2e clic ne trouve
  //    plus la ligne et repart sans rien décaisser.
  let claim = supabase
    .from('purchases')
    .update({ payment_status: 'paid', paid_amount: total })
    .eq('id', purchaseId)
    .eq('business_id', businessId)
    .not('payment_status', 'in', '(paid,cancelled,refunded)')
    .eq('total_amount', purchase.total_amount);
  claim = purchase.paid_amount === null
    ? claim.is('paid_amount', null)
    : claim.eq('paid_amount', purchase.paid_amount);
  const { data: claimed, error: updErr } = await claim.select('id');

  if (updErr) throw new Error(updErr.message);
  if (!claimed?.length) return { settled: false, reason: 'changed' };

  // 3. Record supplier payment transaction. Son id sert de clé d'idempotence à
  //    l'écriture : sans lui, l'achat ne pourrait porter qu'un seul règlement.
  const { data: payment, error: payErr } = await supabase
    .from('supplier_transactions')
    .insert({
      business_id:      businessId,
      supplier_id:      purchase.supplier_id,
      transaction_date: new Date().toISOString(),
      type:             'payment',
      amount,
      currency,
      description:      `Règleman dèt — acha #${purchaseId.slice(0, 8)}`,
      reference_type:   'purchase',
      reference_id:     purchaseId,
      created_by:       userId,
    })
    .select('id')
    .single();

  if (payErr) {
    // Règlement non tracé : l'achat redevient dû, tel qu'il a été lu.
    await supabase
      .from('purchases')
      .update({ payment_status: purchase.payment_status, paid_amount: purchase.paid_amount })
      .eq('id', purchaseId)
      .eq('business_id', businessId)
      .eq('payment_status', 'paid');
    throw new Error(payErr.message);
  }

  // 4. Journal: extinguish the payable (4010) against cash. Without this the
  //    supplier debt stayed on the balance sheet forever after being paid.
  await recordPurchasePaymentEntry({
    purchaseId,
    amount,
    date:         new Date().toISOString().split('T')[0],
    currency,
    label:        `Acha #${purchaseId.slice(0, 8)}`,
    settlementId: payment.id,
  });

  revalidatePath('/suppliers');
  revalidatePath('/dettes');
  revalidatePath('/purchases');
  revalidatePath('/rapports/comptabilite');

  return { settled: true, amount, currency };
}
