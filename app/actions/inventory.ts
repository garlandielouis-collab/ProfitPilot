'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InventoryProduct = {
  id: string;
  name: string;
  category: string | null;
  purchase_price: number;
  sale_price: number;
  stock_quantity: number;
  reorder_point: number | null;
  alert_active: boolean;
};

export type StockAdjustmentPayload = {
  product_id: string;
  new_quantity: number;
  reason: string;
};

export type InventoryMovement = {
  id: string;
  product_id: string;
  product_name: string;
  movement_type: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  currency: string;
  reference_type: string | null;
  notes: string | null;
  created_at: string;
};

// ── getInventory ──────────────────────────────────────────────────────────────

export async function getInventory(): Promise<InventoryProduct[]> {
  const { supabase, businessId, userId } = await getBusinessContext();

  // products use user_id, low_stock_alerts use business_id
  const [prodRes, alertRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, category, purchase_price, sale_price, stock_quantity')
      .eq('user_id', userId)
      .order('name'),
    supabase
      .from('low_stock_alerts')
      .select('product_id, reorder_point, is_resolved')
      .eq('business_id', businessId),
  ]);

  const alertMap = new Map<string, { reorder_point: number; is_resolved: boolean }>();
  for (const a of alertRes.data ?? []) {
    alertMap.set(a.product_id, {
      reorder_point: a.reorder_point,
      is_resolved:   a.is_resolved,
    });
  }

  return (prodRes.data ?? []).map((p: any) => {
    const alert = alertMap.get(p.id);
    return {
      id:             p.id,
      name:           p.name,
      category:       p.category ?? null,
      purchase_price: Number(p.purchase_price),
      sale_price:     Number(p.sale_price),
      stock_quantity: Number(p.stock_quantity),
      reorder_point:  alert?.reorder_point ?? null,
      alert_active:   alert ? !alert.is_resolved && Number(p.stock_quantity) <= (alert.reorder_point ?? 0) : false,
    };
  });
}

// ── adjustStock ───────────────────────────────────────────────────────────────

export async function adjustStock(payload: StockAdjustmentPayload): Promise<void> {
  if (!payload.product_id) throw new Error('Pwodui obligatwa.');
  if (payload.new_quantity < 0) throw new Error('Kantite pa ka negatif.');
  if (!payload.reason?.trim()) throw new Error('Rezon ajisteman obligatwa.');

  const { supabase, businessId, userId } = await getBusinessContext();

  // Get current quantity
  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('stock_quantity, name')
    .eq('id', payload.product_id)
    .single();

  if (pErr || !product) throw new Error('Pwodui pa jwenn.');

  const qtyBefore = Number(product.stock_quantity);
  const qtyAfter  = payload.new_quantity;

  // Update product stock
  const { error: updErr } = await supabase
    .from('products')
    .update({ stock_quantity: qtyAfter })
    .eq('id', payload.product_id);

  if (updErr) throw new Error(updErr.message);

  // Record stock_adjustment
  await supabase.from('stock_adjustments').insert({
    business_id:     businessId,
    product_id:      payload.product_id,
    quantity_before: qtyBefore,
    quantity_after:  qtyAfter,
    reason:          payload.reason.trim(),
    created_by:      userId,
  });

  // Record inventory_movement
  const diff = qtyAfter - qtyBefore;
  await supabase.from('inventory_movements').insert({
    business_id:    businessId,
    product_id:     payload.product_id,
    movement_type:  diff >= 0 ? 'adjustment_in' : 'adjustment_out',
    quantity:       Math.abs(diff),
    unit_cost:      0,
    total_cost:     0,
    currency:       'HTG',
    reference_type: 'adjustment',
    notes:          payload.reason.trim(),
    created_by:     userId,
  });

  // Resolve or update low_stock_alert
  await supabase
    .from('low_stock_alerts')
    .update({ current_qty: qtyAfter, is_resolved: qtyAfter > 0, resolved_at: qtyAfter > 0 ? new Date().toISOString() : null })
    .eq('product_id', payload.product_id)
    .eq('business_id', businessId)
    .eq('is_resolved', false);

  revalidatePath('/inventory');
  revalidatePath('/products');
}

// ── setReorderPoint ───────────────────────────────────────────────────────────

export async function setReorderPoint(productId: string, reorderPoint: number): Promise<void> {
  const { supabase, businessId } = await getBusinessContext();

  const { data: existing } = await supabase
    .from('low_stock_alerts')
    .select('id')
    .eq('product_id', productId)
    .eq('business_id', businessId)
    .maybeSingle();

  const { data: product } = await supabase
    .from('products')
    .select('stock_quantity')
    .eq('id', productId)
    .single();

  const currentQty = Number(product?.stock_quantity ?? 0);

  if (existing) {
    await supabase
      .from('low_stock_alerts')
      .update({ reorder_point: reorderPoint, current_qty: currentQty, is_resolved: currentQty > reorderPoint })
      .eq('id', existing.id);
  } else {
    await supabase.from('low_stock_alerts').insert({
      business_id:   businessId,
      product_id:    productId,
      reorder_point: reorderPoint,
      current_qty:   currentQty,
      is_resolved:   currentQty > reorderPoint,
    });
  }

  revalidatePath('/inventory');
}

// ── getTopProductsBySales ─────────────────────────────────────────────────────

export type TopSellingProduct = {
  product_id:   string;
  product_name: string;
  qty_sold:     number;
  revenue:      number;
  currency:     string;
};

export async function getTopProductsBySales(limit = 8): Promise<TopSellingProduct[]> {
  const { supabase, businessId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('sale_items')
    .select('product_id, product_name, quantity, line_total, currency, sales!inner(business_id)')
    .eq('sales.business_id', businessId);

  if (error || !data) return [];

  // Aggregate by product
  const map = new Map<string, TopSellingProduct>();
  for (const r of data as any[]) {
    const key = r.product_id;
    if (!map.has(key)) {
      map.set(key, {
        product_id:   r.product_id,
        product_name: r.product_name ?? '—',
        qty_sold:     0,
        revenue:      0,
        currency:     r.currency ?? 'HTG',
      });
    }
    const entry = map.get(key)!;
    entry.qty_sold += Number(r.quantity ?? 0);
    entry.revenue  += Number(r.line_total ?? 0);
  }

  return [...map.values()]
    .sort((a, b) => b.qty_sold - a.qty_sold)
    .slice(0, limit);
}

// ── getInventoryMovements ─────────────────────────────────────────────────────
// Derived from sale_items + purchase_items + stock_adjustments
// (does not depend on inventory_movements table permissions)

export async function getInventoryMovements(limit = 50): Promise<InventoryMovement[]> {
  const { supabase, businessId, userId } = await getBusinessContext();

  // All 4 queries in parallel — no waterfall
  const [salesRes, purchRes, adjRes, prodsRes] = await Promise.all([
    supabase
      .from('sale_items')
      .select('id, product_id, product_name, quantity, unit_price, line_total, currency, sale_id, created_at, sales!inner(invoice_number, business_id)')
      .eq('sales.business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit),

    supabase
      .from('purchase_items')
      .select('id, product_id, product_name, quantity, unit_cost, line_total, currency, purchase_id, created_at, purchases!inner(po_number, business_id)')
      .eq('purchases.business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit),

    supabase
      .from('stock_adjustments')
      .select('id, product_id, quantity_before, quantity_after, reason, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit),

    // Product names for adjustments — fetched in parallel, not after
    supabase.from('products').select('id, name').eq('user_id', userId),
  ]);

  const prodNameMap = new Map((prodsRes.data ?? []).map((p: any) => [p.id, p.name]));

  const movements: InventoryMovement[] = [];

  // Sales → sale_out
  for (const r of salesRes.data ?? []) {
    const sale = (r as any).sales;
    movements.push({
      id:             r.id,
      product_id:     r.product_id,
      product_name:   r.product_name ?? '—',
      movement_type:  'sale_out',
      quantity:       Number(r.quantity),
      unit_cost:      Number(r.unit_price),
      total_cost:     Number(r.line_total),
      currency:       r.currency ?? 'HTG',
      reference_type: 'sale',
      notes:          `Vant — ${sale?.invoice_number ?? ''}`,
      created_at:     r.created_at,
    });
  }

  // Purchases → purchase_in
  for (const r of purchRes.data ?? []) {
    const purch = (r as any).purchases;
    movements.push({
      id:             r.id,
      product_id:     r.product_id,
      product_name:   r.product_name ?? '—',
      movement_type:  'purchase_in',
      quantity:       Number(r.quantity),
      unit_cost:      Number(r.unit_cost),
      total_cost:     Number(r.line_total),
      currency:       r.currency ?? 'HTG',
      reference_type: 'purchase',
      notes:          `Acha — ${purch?.po_number ?? ''}`,
      created_at:     r.created_at,
    });
  }

  // Adjustments
  for (const r of adjRes.data ?? []) {
    const diff = Number(r.quantity_after) - Number(r.quantity_before);
    movements.push({
      id:             r.id,
      product_id:     r.product_id,
      product_name:   prodNameMap.get(r.product_id) ?? '—',
      movement_type:  diff >= 0 ? 'adjustment_in' : 'adjustment_out',
      quantity:       Math.abs(diff),
      unit_cost:      0,
      total_cost:     0,
      currency:       'HTG',
      reference_type: 'adjustment',
      notes:          r.reason ?? null,
      created_at:     r.created_at,
    });
  }

  // Sort by date desc and limit
  return movements
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}
