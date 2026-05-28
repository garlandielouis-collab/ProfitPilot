'use server';

import { supabaseServer } from '../../lib/supabaseServerClient';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SavePurchasePayload = {
  supplier_id: string;
  product_id: string;
  quantity: number;
  purchase_price_per_unit: number;
  total_purchase_amount: number;  // after discount
  discount_percent?: number;
  payment_status: 'Payé' | 'À Crédit';
  payment_method?: string;
  metadata?: Record<string, string>;
  owner_id?: string;
};

// ── savePurchase ──────────────────────────────────────────────────────────────

export async function savePurchase(payload: SavePurchasePayload) {
  if (!payload.supplier_id)   throw new Error('Fournisseur obligatoire');
  if (!payload.product_id)    throw new Error('Produit obligatoire');
  if (payload.quantity <= 0)  throw new Error('Quantité invalide');
  if (payload.purchase_price_per_unit < 0) throw new Error('Prix unitaire invalide');
  if (!['Payé', 'À Crédit'].includes(payload.payment_status))
    throw new Error('Statut de paiement invalide');

  const discountPct  = payload.discount_percent ?? 0;
  const priceBeforeDiscount = payload.quantity * payload.purchase_price_per_unit;
  const expectedTotal = parseFloat((priceBeforeDiscount * (1 - discountPct / 100)).toFixed(2));

  if (Math.abs(expectedTotal - payload.total_purchase_amount) > 1) {
    throw new Error('Le total calculé ne correspond pas au montant envoyé');
  }

  const insertPayload: Record<string, unknown> = {
    supplier_id:            payload.supplier_id,
    product_id:             payload.product_id,
    quantity:               payload.quantity,
    purchase_price_per_unit: payload.purchase_price_per_unit,
    total_purchase_amount:  payload.total_purchase_amount,
    payment_status:         payload.payment_status,
    discount_percent:       discountPct,
    payment_method:         payload.payment_method ?? null,
    metadata:               payload.metadata ?? null,
  };

  if (payload.owner_id) insertPayload.owner_id = payload.owner_id;

  const { error } = await supabaseServer.from('purchases').insert(insertPayload);
  if (error) throw new Error(error.message);

  // Update stock
  const { data: product, error: fetchErr } = await supabaseServer
    .from('products')
    .select('stock_quantity')
    .eq('id', payload.product_id)
    .single();

  if (fetchErr || !product) throw new Error('Produit non trouvé pour mise à jour stock');

  const { error: stockErr } = await supabaseServer
    .from('products')
    .update({ stock_quantity: (product as any).stock_quantity + payload.quantity })
    .eq('id', payload.product_id);

  if (stockErr) throw new Error(stockErr.message);

  return true;
}
