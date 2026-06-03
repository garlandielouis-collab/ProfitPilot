'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';
import { recordSaleEntry } from './accounting';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CartItemPayload = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
};

export type CreateSalePayload = {
  items: CartItemPayload[];
  payment_method: 'Cash' | 'MonCash' | 'Natcash' | 'Card';
  is_credit: boolean;
  currency: 'HTG' | 'USD';
  discount_percent?: number;
  customer_id?: string;
  customer_name?: string;
  metadata?: Record<string, string>;
};

export type SaleCreationResult = {
  invoiceNumber: string;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900000) + 100000;
  return `PP-${year}-${rand}`;
}

// ── Main action ───────────────────────────────────────────────────────────────

export async function createSaleAction(payload: CreateSalePayload): Promise<SaleCreationResult> {
  const {
    items,
    payment_method,
    is_credit,
    currency,
    discount_percent = 0,
    customer_id,
    customer_name,
    metadata,
  } = payload;

  if (!items?.length) throw new Error('Le panier est vide.');
  if (!['Cash', 'MonCash', 'Natcash', 'Card'].includes(payment_method)) throw new Error('Mode de paiement invalide.');
  if (discount_percent < 0 || discount_percent > 100) throw new Error('Remise invalide (0–100%).');
  if (is_credit && !customer_name?.trim()) throw new Error('Un client est requis pour une vente à crédit.');

  const { supabase: sb, businessId, userId } = await getBusinessContext();

  const invoiceNumber = generateInvoiceNumber();
  const multiplier = 1 - discount_percent / 100;
  const payment_status = is_credit ? 'credit' : 'paid';

  // ── 1. Validate stock for all items ───────────────────────────────────────
  for (const item of items) {
    if (!item.product_id || item.quantity < 1 || item.unit_price <= 0) {
      throw new Error(`Données invalides pour "${item.product_name}".`);
    }
    const { data: product, error: pErr } = await sb
      .from('products')
      .select('stock_quantity')
      .eq('id', item.product_id)
      .single();

    if (pErr || !product) throw new Error(`Produit introuvable: ${item.product_name}`);
    if (product.stock_quantity < item.quantity) {
      throw new Error(`Stock insuffisant pour "${item.product_name}" (disponible: ${product.stock_quantity}).`);
    }
  }

  // ── 2. Compute totals ──────────────────────────────────────────────────────
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const discountAmount = parseFloat((subtotal * (discount_percent / 100)).toFixed(2));
  const totalAmount = parseFloat((subtotal - discountAmount).toFixed(2));

  // ── 3. Insert the sale header ──────────────────────────────────────────────
  const { data: saleRow, error: sErr } = await sb
    .from('sales')
    .insert({
      business_id:      businessId,
      invoice_number:   invoiceNumber,
      customer_id:      customer_id ?? null,
      customer_name:    customer_name ?? null,
      currency,
      payment_method,
      payment_status,
      discount_percent,
      subtotal_amount:  parseFloat(subtotal.toFixed(2)),
      discount_amount:  discountAmount,
      total_amount:     totalAmount,
      paid_amount:      is_credit ? 0 : totalAmount,
      sale_date:        new Date().toISOString().split('T')[0],
      metadata:         metadata ?? null,
      created_by:       userId,
    })
    .select('id')
    .single();

  if (sErr) throw new Error(sErr.message);
  const saleId = saleRow.id;

  // ── 4. Insert sale_items ───────────────────────────────────────────────────
  const saleItems = items.map((item) => ({
    sale_id:       saleId,
    business_id:   businessId,
    product_id:    item.product_id,
    product_name:  item.product_name,
    quantity:      item.quantity,
    unit_price:    item.unit_price,
    discount_percent,
    line_total:    parseFloat((item.unit_price * item.quantity * multiplier).toFixed(2)),
    currency,
  }));

  const { error: siErr } = await sb.from('sale_items').insert(saleItems);
  if (siErr) throw new Error(siErr.message);

  // ── 5. Decrement stock + record inventory_movements ───────────────────────
  for (const item of items) {
    const { data: product } = await sb
      .from('products')
      .select('stock_quantity')
      .eq('id', item.product_id)
      .single();
    if (product) {
      const newQty = Math.max(0, product.stock_quantity - item.quantity);
      await sb
        .from('products')
        .update({ stock_quantity: newQty })
        .eq('id', item.product_id);

      await sb.from('inventory_movements').insert({
        business_id:    businessId,
        product_id:     item.product_id,
        movement_type:  'sale_out',
        quantity:       item.quantity,
        unit_cost:      item.unit_price,
        total_cost:     parseFloat((item.unit_price * item.quantity * multiplier).toFixed(2)),
        currency,
        reference_type: 'sale',
        reference_id:   saleId,
        notes:          `Vant — ${invoiceNumber}`,
        created_by:     userId,
      });
    }
  }

  // ── 6. Credit sale: record customer_transaction + update outstanding_balance
  if (is_credit && customer_id) {
    const { data: cust } = await sb
      .from('customers')
      .select('outstanding_balance')
      .eq('id', customer_id)
      .single();

    const balanceBefore = cust?.outstanding_balance ?? 0;
    const balanceAfter  = parseFloat((balanceBefore + totalAmount).toFixed(2));

    await sb.from('customer_transactions').insert({
      business_id:      businessId,
      customer_id,
      transaction_date: new Date().toISOString(),
      type:             'credit',
      amount:           totalAmount,
      currency,
      description:      `Vente credit — ${invoiceNumber}`,
      reference_type:   'sale',
      reference_id:     saleId,
      balance_before:   balanceBefore,
      balance_after:    balanceAfter,
      created_by:       userId,
    });

    await sb
      .from('customers')
      .update({ outstanding_balance: balanceAfter })
      .eq('id', customer_id);
  }

  try {
    await recordSaleEntry({
      saleId,
      invoiceNumber,
      amount: totalAmount,
      isCredit: is_credit,
      date: new Date().toISOString().split('T')[0],
      currency,
      paymentMethod: payment_method,
    });
  } catch (error) {
    console.error('[accounting] recordSaleEntry failed:', (error as Error).message);
  }

  revalidatePath('/sales');
  revalidatePath('/clients');
  revalidatePath('/dettes');

  return {
    invoiceNumber,
    subtotal:       parseFloat(subtotal.toFixed(2)),
    discountAmount,
    totalAmount,
  };
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export type SalesMetrics = {
  monthlyTotal:  number;
  allTimeTotal:  number;
  monthlyCount:  number;
  topClient:     string | null;
};

export async function getSalesMetrics(): Promise<SalesMetrics> {
  let supabase: any, businessId: string;
  try {
    const ctx = await getBusinessContext();
    supabase = ctx.supabase; businessId = ctx.businessId;
  } catch { return { monthlyTotal: 0, allTimeTotal: 0, monthlyCount: 0, topClient: null }; }

  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [monthly, allTime] = await Promise.all([
    supabase.from('sales').select('total_amount, customer_name')
      .eq('business_id', businessId).gte('created_at', monthStart),
    supabase.from('sales').select('total_amount')
      .eq('business_id', businessId),
  ]);

  const sum = (rows: any[] | null) =>
    (rows ?? []).reduce((s: number, r: any) => s + parseFloat(r.total_amount ?? 0), 0);

  // Top client this month
  const clientTotals: Record<string, number> = {};
  for (const r of monthly.data ?? []) {
    if (r.customer_name) {
      clientTotals[r.customer_name] = (clientTotals[r.customer_name] ?? 0) + parseFloat(r.total_amount ?? 0);
    }
  }
  const topClient = Object.entries(clientTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    monthlyTotal: parseFloat(sum(monthly.data).toFixed(2)),
    allTimeTotal: parseFloat(sum(allTime.data).toFixed(2)),
    monthlyCount: (monthly.data ?? []).length,
    topClient,
  };
}

// ── CRM data ──────────────────────────────────────────────────────────────────

export type ClientSummary = {
  name:     string;
  total:    number;
  count:    number;
  lastDate: string;
  methods:  string[];
};

export async function getSalesCRMData(): Promise<ClientSummary[]> {
  let supabase: any, businessId: string;
  try {
    const ctx = await getBusinessContext();
    supabase = ctx.supabase; businessId = ctx.businessId;
  } catch { return []; }

  const { data } = await supabase
    .from('sales')
    .select('customer_name, total_amount, payment_method, created_at')
    .eq('business_id', businessId)
    .not('customer_name', 'is', null)
    .order('created_at', { ascending: false });

  const map = new Map<string, ClientSummary>();
  for (const row of (data ?? [])) {
    const name = row.customer_name ?? 'Anonim';
    const amt  = parseFloat(String(row.total_amount ?? 0));
    if (!map.has(name)) {
      map.set(name, { name, total: 0, count: 0, lastDate: row.created_at, methods: [] });
    }
    const c = map.get(name)!;
    c.total += amt;
    c.count += 1;
    if (row.created_at > c.lastDate) c.lastDate = row.created_at;
    if (row.payment_method && !c.methods.includes(row.payment_method))
      c.methods.push(row.payment_method);
  }

  return [...map.values()].sort((a, b) => b.total - a.total);
}

// ── Get sales list ────────────────────────────────────────────────────────────

export async function getSalesAction(limit = 50) {
  const { supabase, businessId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('sales')
    .select(`
      id, invoice_number, customer_id, customer_name,
      total_amount, currency, payment_method, payment_status,
      discount_percent, sale_date, created_at,
      customers ( id, name, phone )
    `)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}
