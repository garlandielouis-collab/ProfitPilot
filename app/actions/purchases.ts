'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';
import { recordPurchaseEntry } from './accounting';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SavePurchasePayload = {
  supplier_id:             string;
  product_id:              string;
  product_name:            string;
  quantity:                number;
  purchase_price_per_unit: number;
  total_purchase_amount:   number;
  discount_percent?:       number;
  payment_status:          'Payé' | 'À Crédit';   // UI values — mapped to DB below
  payment_method?:         string;
  currency?:               'HTG' | 'USD';
  metadata?:               Record<string, string>;
};

// ── savePurchase ──────────────────────────────────────────────────────────────

export async function savePurchase(payload: SavePurchasePayload): Promise<true> {
  if (!payload.supplier_id)  throw new Error('Founisè obligatwa.');
  if (!payload.product_id)   throw new Error('Pwodui obligatwa.');
  if (payload.quantity <= 0) throw new Error('Kantite pa valab.');
  if (payload.purchase_price_per_unit < 0) throw new Error('Pri inite pa valab.');

  const { supabase, businessId, userId, exchangeRate } = await getBusinessContext();

  const discountPct   = payload.discount_percent ?? 0;
  const currency      = payload.currency ?? 'HTG';
  const subtotal      = parseFloat((payload.quantity * payload.purchase_price_per_unit).toFixed(2));
  const discountAmt   = parseFloat((subtotal * discountPct / 100).toFixed(2));
  const total         = parseFloat(payload.total_purchase_amount.toFixed(2));

  // Map UI → DB enums
  const dbStatus = payload.payment_status === 'Payé' ? 'paid' : 'credit';
  const paidAmt  = dbStatus === 'paid' ? total : 0;

  const METHOD_MAP: Record<string, string> = {
    'Espèces': 'Cash', 'Cash': 'Cash',
    'Moncash': 'MonCash', 'MonCash': 'MonCash',
    'Natcash': 'Natcash',
    'Carte Visa': 'Card', 'Card': 'Card',
    'Virement': 'Virement', 'Chèque': 'Chèque', 'Crédit': 'Crédit',
  };
  const dbMethod = payload.payment_method
    ? (METHOD_MAP[payload.payment_method] ?? 'Cash')
    : null;

  // Generate PO number app-side (avoids permission issue on global_doc_seq)
  const year  = new Date().getFullYear();
  const rand  = Math.floor(Math.random() * 900000) + 100000;
  const poNumber = `PO-${year}-${rand}`;

  // ── 1. Insert purchase header ──────────────────────────────────────────────
  const { data: purchaseRow, error: pErr } = await supabase
    .from('purchases')
    .insert({
      business_id:     businessId,
      supplier_id:     payload.supplier_id,
      po_number:       poNumber,
      purchase_date:   new Date().toISOString().split('T')[0],
      status:          'confirmed',
      currency,
      exchange_rate:    currency === 'USD' ? exchangeRate : 1,
      subtotal_amount: subtotal,
      discount_amount: discountAmt,
      total_amount:    total,
      paid_amount:     paidAmt,
      payment_method:  dbMethod,
      payment_status:  dbStatus,
      metadata:        payload.metadata ?? null,
      created_by:      userId,
    })
    .select('id')
    .single();

  if (pErr) throw new Error(pErr.message);
  const purchaseId = purchaseRow.id;

  // ── 2. Insert purchase_item ────────────────────────────────────────────────
  const { error: iErr } = await supabase
    .from('purchase_items')
    .insert({
      purchase_id:      purchaseId,
      business_id:      businessId,
      product_id:       payload.product_id,
      product_name:     payload.product_name,
      quantity:         payload.quantity,
      unit_cost:        payload.purchase_price_per_unit,
      discount_percent: discountPct,
      discount_amount:  discountAmt,
      line_total:       total,
      quantity_received: payload.quantity,
      currency,
    });

  if (iErr) throw new Error(iErr.message);

  // ── 3. Update product stock (always — goods received on purchase) ──────────
  const { data: product } = await supabase
    .from('products')
    .select('stock_quantity')
    .eq('id', payload.product_id)
    .single();

  if (product) {
    await supabase
      .from('products')
      .update({ stock_quantity: product.stock_quantity + payload.quantity })
      .eq('id', payload.product_id);

    // Record inventory movement
    await supabase.from('inventory_movements').insert({
      business_id:    businessId,
      product_id:     payload.product_id,
      movement_type:  'purchase_in',
      quantity:       payload.quantity,
      unit_cost:      payload.purchase_price_per_unit,
      total_cost:     total,
      currency,
      reference_type: 'purchase',
      reference_id:   purchaseId,
      notes:          `Acha — ${poNumber}`,
      created_by:     userId,
    });
  }

  // ── 5. Update supplier stats + record transaction ─────────────────────────
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('outstanding_balance, total_purchased')
    .eq('id', payload.supplier_id)
    .single();

  const balBefore    = Number(supplier?.outstanding_balance ?? 0);
  const totalPurch   = Number(supplier?.total_purchased     ?? 0);
  const newBalance   = dbStatus === 'credit' ? balBefore + total : balBefore;
  const newTotalPurch = totalPurch + total;

  await supabase
    .from('suppliers')
    .update({
      outstanding_balance: newBalance,
      total_purchased:     newTotalPurch,
    })
    .eq('id', payload.supplier_id);

  // Record supplier transaction
  await supabase.from('supplier_transactions').insert({
    business_id:      businessId,
    supplier_id:      payload.supplier_id,
    transaction_date: new Date().toISOString(),
    type:             dbStatus === 'credit' ? 'credit' : 'purchase',
    amount:           total,
    currency,
    description:      `Acha ${payload.product_name} ×${payload.quantity} — ${poNumber}`,
    reference_type:   'purchase',
    reference_id:     purchaseId,
    balance_before:   balBefore,
    balance_after:    newBalance,
    created_by:       userId,
  });

  try {
    await recordPurchaseEntry({
      purchaseId,
      poNumber,
      amount: total,
      isCredit: dbStatus === 'credit',
      date: new Date().toISOString().split('T')[0],
      currency,
      paymentMethod: dbMethod ?? 'Cash',
      exchangeRate: currency === 'USD' ? exchangeRate : 1,
    });
  } catch (error) {
    console.error('[accounting] recordPurchaseEntry failed:', (error as Error).message);
  }

  revalidatePath('/purchases');
  revalidatePath('/products');
  revalidatePath('/dettes');
  revalidatePath('/rapports/comptabilite');

  return true;
}

// ── getPurchases ──────────────────────────────────────────────────────────────

export async function getPurchases(limit = 50) {
  const { supabase, businessId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('purchases')
    .select(`
      id, po_number, purchase_date, total_amount, paid_amount,
      payment_method, payment_status, currency, created_at,
      suppliers ( id, name )
    `)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}
