'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';
import { recordPurchaseEntry } from '../../lib/accounting/posting';
import { logActivity } from '../../lib/activityLog';
import { notify } from '../../lib/notify';

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
  /** Optionnel : à défaut, l'entrepôt le plus ancien du commerce est utilisé. */
  warehouse_id?:           string;
};

async function rollbackPurchase(supabase: any, purchaseId: string) {
  await supabase.from('supplier_transactions').delete().eq('reference_type', 'purchase').eq('reference_id', purchaseId);
  await supabase.from('inventory_movements').delete().eq('reference_type', 'purchase').eq('reference_id', purchaseId);
  await supabase.from('purchase_items').delete().eq('purchase_id', purchaseId);
  await supabase.from('purchases').delete().eq('id', purchaseId);
}

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
  // Le journal d'activité et la notification « Nouvel achat » partent en fin
  // de parcours, une fois l'achat entièrement écrit : émis ici, ils survivaient
  // à chacune des annulations ci-dessous et annonçaient un achat disparu.

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

  // Une ligne refusée laissait l'en-tête en place : un achat sans article,
  // compté comme dette fournisseur dans /dettes. On défait ce qui a déjà été
  // écrit pour cet achat avant de rendre l'erreur, comme les étapes suivantes.
  if (iErr) {
    await rollbackPurchase(supabase, purchaseId);
    throw new Error(iErr.message);
  }

  // ── 3. Update product stock (always — goods received on purchase) ──────────
  const { data: product } = await supabase
    .from('products')
    .select('stock_quantity')
    .eq('id', payload.product_id)
    .single();

  if (!product) {
    await rollbackPurchase(supabase, purchaseId);
    throw new Error('Produit introuvable.');
  }

  const originalStock = product.stock_quantity;
  const { error: stockErr } = await supabase
    .from('products')
    .update({ stock_quantity: originalStock + payload.quantity })
    .eq('id', payload.product_id);

  if (stockErr) {
    await rollbackPurchase(supabase, purchaseId);
    throw new Error(stockErr.message);
  }

  let warehouseId = payload.warehouse_id ?? null;
  if (!warehouseId) {
    const { data: warehouses, error: whErr } = await supabase
      .from('warehouses')
      .select('id')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (whErr) {
      await rollbackPurchase(supabase, purchaseId);
      throw new Error('Impossible de récupérer l’entrepôt par défaut.');
    }

    warehouseId = warehouses?.[0]?.id ?? null;

    // Aucun entrepôt : on en crée un, on ne renvoie pas le marchand ailleurs.
    //
    // Rien dans l'application ne permet de créer un entrepôt — la table n'est
    // peuplée par aucun écran. Le message « créez-en un d'abord » désignait donc
    // une action impossible, et tout achat échouait, pour tout le monde.
    //
    // L'entrepôt est une notion de gestion de stock dont un commerce à un seul
    // point de vente n'a pas à s'occuper : il en a un, implicitement, et c'est
    // sa boutique. On le matérialise à la première réception de marchandise.
    if (!warehouseId) {
      const { data: created, error: createWhErr } = await supabase
        .from('warehouses')
        .insert({ business_id: businessId, name: 'Dépôt principal', is_default: true })
        .select('id')
        .single();

      if (createWhErr || !created) {
        await rollbackPurchase(supabase, purchaseId);
        throw new Error(createWhErr?.message ?? 'Impossible de créer l’entrepôt par défaut.');
      }
      warehouseId = created.id;
    }
  }

  const { error: invErr } = await supabase.from('inventory_movements').insert({
    business_id:    businessId,
    warehouse_id:   warehouseId,
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

  if (invErr) {
    await supabase
      .from('products')
      .update({ stock_quantity: originalStock })
      .eq('id', payload.product_id);
    await rollbackPurchase(supabase, purchaseId);
    throw new Error(invErr.message);
  }

  // ── 5. Record supplier transaction ───────────────────────────────────────
  const { error: txErr } = await supabase.from('supplier_transactions').insert({
    business_id:      businessId,
    supplier_id:      payload.supplier_id,
    transaction_date: new Date().toISOString(),
    type:             dbStatus === 'credit' ? 'credit' : 'purchase',
    amount:           total,
    currency,
    description:      `Acha ${payload.product_name} ×${payload.quantity} — ${poNumber}`,
    reference_type:   'purchase',
    reference_id:     purchaseId,
    created_by:       userId,
  });

  if (txErr) {
    await supabase
      .from('products')
      .update({ stock_quantity: originalStock })
      .eq('id', payload.product_id);
    await rollbackPurchase(supabase, purchaseId);
    throw new Error(txErr.message);
  }

  // L'achat est complet — en-tête, ligne, stock, mouvement, transaction
  // fournisseur : c'est maintenant, et seulement maintenant, qu'on l'annonce.
  void logActivity({ action: 'create', entity: 'purchase', entityId: purchaseId, newValues: { product_name: payload.product_name, total: total, status: dbStatus } });
  void notify({
    companyId: businessId, triggeredBy: userId,
    type: 'purchase_created',
    title: `Nouvel achat — ${payload.product_name}`,
    body: `Qté : ${payload.quantity} · Montant : ${total.toLocaleString('fr-FR')} ${currency}`,
    entity: 'purchase', entityId: purchaseId,
    data: { product: payload.product_name, quantity: payload.quantity, total, currency },
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
