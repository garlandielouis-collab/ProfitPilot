'use server';

import { revalidatePath } from 'next/cache';
import { verifyBusinessAccess, getBusinessContext } from '../../lib/serverAuth';
import { createSaleSchema, type CreateSaleInput } from '../../lib/validations';
import { recordSaleEntry } from './accounting';

// ── Types (backward compat pour le UI) ────────────────────────────────────────

export type CartItemPayload = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  tax_rate?: number;
};

export type CreateSaleResult =
  | { success: true;  invoiceNumber: string; subtotal: number; discountAmount: number; totalAmount: number }
  | { success: false; errors: Array<{ field: string; message: string }> };

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt2(n: number): number {
  return parseFloat(n.toFixed(2));
}

async function generateInvoiceNumber(supabase: any, businessId: string): Promise<string> {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('sales')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId);
  return `INV-${year}-${String((count ?? 0) + 1).padStart(5, '0')}`;
}

// ── Main action ───────────────────────────────────────────────────────────────

export async function createSaleAction(input: CreateSaleInput): Promise<CreateSaleResult> {
  // ── 1. Session + business membership ─────────────────────────────────────
  const ctx = await verifyBusinessAccess(input.business_id);
  const { supabase: sb, userId, businessId } = ctx;

  // ── 2. Zod validation ────────────────────────────────────────────────────
  const parsed = createSaleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    };
  }
  const data = parsed.data;
  const today = data.sale_date ?? new Date().toISOString().split('T')[0];

  // ── 3. Exchange rate — already cached in verifyBusinessAccess context ────
  const exchangeRate = ctx.exchangeRate;

  // ── 4. Check stock via warehouse_stock + products fallback ──────────────
  type StockRow = { product_id: string; variant_id: string | null; quantity: number };
  const productIds = [...new Set(data.items.map((i) => i.product_id))];
  const [stockResult, prodResult] = await Promise.all([
    sb.from('warehouse_stock')
      .select('product_id, variant_id, quantity')
      .eq('business_id', businessId)
      .in('product_id', productIds),
    sb.from('products')
      .select('id, stock_quantity')
      .in('id', productIds),
  ]);

  if (stockResult.error) return { success: false, errors: [{ field: 'stock', message: stockResult.error.message }] };
  const stockRows: StockRow[] = stockResult.data ?? [];
  const prodStockMap: Record<string, number> = {};
  for (const p of prodResult.data ?? []) prodStockMap[p.id] = p.stock_quantity ?? 0;

  for (const item of data.items) {
    let available = 0;
    if (item.variant_id) {
      const row = (stockRows ?? []).find(
        (r: StockRow) =>
          r.product_id === item.product_id &&
          r.variant_id === item.variant_id &&
          (!data.warehouse_id || true)
      );
      available = row?.quantity ?? 0;
    } else {
      const wsQty = (stockRows ?? [])
        .filter((r: StockRow) => r.product_id === item.product_id)
        .reduce((s: number, r: StockRow) => s + r.quantity, 0);
      available = wsQty > 0 ? wsQty : (prodStockMap[item.product_id] ?? 0);
    }
    if (available < item.quantity) {
      return {
        success: false,
        errors: [{ field: `items.${item.product_name}`, message: `Stock insuffisant pou "${item.product_name}" (disponib: ${available})` }],
      };
    }
  }

  // ── 5. Compute totals ────────────────────────────────────────────────────
  const subtotal = data.items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const discountAmount = fmt2(subtotal * (data.discount_percent / 100));
  const totalAmount = fmt2(subtotal - discountAmount + data.tax_amount);
  const paidAmount = data.payment_status === 'paid' ? totalAmount : data.payment_status === 'partial' ? 0 : 0;

  // ── 6. Insert sale ───────────────────────────────────────────────────────
  const invoiceNumber = await generateInvoiceNumber(sb, businessId);

  const { data: saleRow, error: sErr } = await sb
    .from('sales')
    .insert({
      business_id:      businessId,
      warehouse_id:     data.warehouse_id ?? null,
      invoice_number:   invoiceNumber,
      customer_id:      data.customer_id ?? null,
      customer_name:    data.customer_name ?? null,
      sale_date:        today,
      currency:         data.currency,
      exchange_rate:    data.currency === 'USD' ? exchangeRate : 1,
      payment_method:   data.payment_method,
      payment_status:   data.payment_status,
      discount_percent: data.discount_percent,
      discount_amount:  discountAmount,
      tax_amount:       data.tax_amount,
      subtotal_amount:  fmt2(subtotal),
      total_amount:     totalAmount,
      paid_amount:      paidAmount,
      notes:            data.notes ?? null,
      created_by:       userId,
    })
    .select('id')
    .single();

  if (sErr) return { success: false, errors: [{ field: 'sale', message: sErr.message }] };
  const saleId = saleRow.id;

  // ── 7. Insert sale_items ─────────────────────────────────────────────────
  const multiplier = 1 - data.discount_percent / 100;
  const saleItems = data.items.map((item) => ({
    sale_id:          saleId,
    business_id:      businessId,
    product_id:       item.product_id,
    variant_id:       item.variant_id ?? null,
    product_name:     item.product_name,
    sku:              item.sku ?? null,
    quantity:         item.quantity,
    unit_price:       item.unit_price,
    cost_price:       0, // will be updated from product_variants below
    discount_percent: item.discount_percent,
    line_total:       fmt2(item.unit_price * item.quantity * multiplier),
    tax_rate:         item.tax_rate,
    tax_amount:       fmt2(item.unit_price * item.quantity * (item.tax_rate / 100)),
    currency:         data.currency,
  }));

  // Fetch purchase_price for each variant
  const variantIds = data.items.filter((i) => i.variant_id).map((i) => i.variant_id!);
  if (variantIds.length > 0) {
    const { data: variants } = await sb
      .from('product_variants')
      .select('id, purchase_price')
      .in('id', variantIds);
    const priceMap = new Map((variants ?? []).map((v: any) => [v.id, Number(v.purchase_price ?? 0)]));
    for (const si of saleItems) {
      if (si.variant_id) si.cost_price = priceMap.get(si.variant_id) ?? 0;
    }
  }

  const { error: siErr } = await sb.from('sale_items').insert(saleItems);
  if (siErr) return { success: false, errors: [{ field: 'sale_items', message: siErr.message }] };

  // ── 8. Decrement warehouse_stock + inventory_movements ───────────────────
  for (const item of data.items) {
    const cost_price = saleItems.find((si) => si.product_id === item.product_id)?.cost_price ?? 0;

    // Decrement warehouse_stock (if entry exists)
    const matchQty = item.variant_id
      ? sb.from('warehouse_stock').select('quantity').eq('product_id', item.product_id).eq('variant_id', item.variant_id).maybeSingle()
      : null;

    const stockRow = matchQty ? (await matchQty).data : null;
    if (stockRow) {
      const newQty = Math.max(0, stockRow.quantity - item.quantity);
      const upd: any = { quantity: newQty };
      if (data.warehouse_id) upd.warehouse_id = data.warehouse_id;
      await sb.from('warehouse_stock').update(upd).eq('product_id', item.product_id);
      if (item.variant_id) await sb.from('warehouse_stock').update(upd).eq('variant_id', item.variant_id);
    }

    // Insert inventory_movement
    await sb.from('inventory_movements').insert({
      business_id:    businessId,
      warehouse_id:   data.warehouse_id ?? (stockRow ? undefined : null),
      product_id:     item.product_id,
      variant_id:     item.variant_id ?? null,
      movement_type:  'sale_out',
      quantity:       item.quantity,
      unit_cost:      cost_price,
      total_cost:     fmt2(cost_price * item.quantity),
      currency:       data.currency,
      reference_type: 'sale',
      reference_id:   saleId,
      notes:          `Vente — ${invoiceNumber}`,
      created_by:     userId,
    });

    // Update products.stock_quantity
    const { data: legacy } = await sb
      .from('products')
      .select('stock_quantity')
      .eq('id', item.product_id)
      .maybeSingle();
    if (legacy) {
      await sb
        .from('products')
        .update({ stock_quantity: Math.max(0, legacy.stock_quantity - item.quantity) })
        .eq('id', item.product_id);
    }
  }

  // ── 9. Credit sale: customer_transaction + outstanding_balance ───────────
  const isCredit = data.payment_status === 'credit';
  if (isCredit && data.customer_id) {
    const { data: cust } = await sb
      .from('customers')
      .select('outstanding_balance')
      .eq('id', data.customer_id)
      .single();

    const balanceBefore = cust?.outstanding_balance ?? 0;
    const balanceAfter = fmt2(balanceBefore + totalAmount);

    await sb.from('customer_transactions').insert({
      business_id:      businessId,
      customer_id:      data.customer_id,
      transaction_date: today,
      type:             'sale',
      amount:           totalAmount,
      currency:         data.currency,
      description:      `Vente à crédit — ${invoiceNumber}`,
      reference_type:   'sale',
      reference_id:     saleId,
      balance_before:   balanceBefore,
      balance_after:    balanceAfter,
      created_by:       userId,
    });

    await sb
      .from('customers')
      .update({ outstanding_balance: balanceAfter, total_purchases: sb.rpc('increment', { x: totalAmount }) })
      .eq('id', data.customer_id);
  }

  // ── 10. Journal entry (non-bloquant) ─────────────────────────────────────
  try {
    await recordSaleEntry({
      saleId,
      invoiceNumber,
      amount: totalAmount,
      isCredit,
      date: today,
      currency: data.currency,
      paymentMethod: data.payment_method,
      exchangeRate: data.currency === 'USD' ? exchangeRate : 1,
    });
  } catch (error) {
    console.error('[accounting] recordSaleEntry failed:', (error as Error).message);
  }

  revalidatePath('/sales');
  revalidatePath('/clients');
  revalidatePath('/dettes');
  revalidatePath('/rapports/comptabilite');

  return {
    success: true,
    invoiceNumber,
    subtotal: fmt2(subtotal),
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
  let supabase: any, businessId: string, exchangeRate: number;
  try {
    const ctx = await getBusinessContext();
    supabase = ctx.supabase; businessId = ctx.businessId; exchangeRate = ctx.exchangeRate;
  } catch { return { monthlyTotal: 0, allTimeTotal: 0, monthlyCount: 0, topClient: null }; }

  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const toHtg = (amt: number, currency: string) =>
    (currency ?? 'HTG').toUpperCase() === 'USD' ? amt * exchangeRate : amt;

  const [monthly, allTime] = await Promise.all([
    supabase.from('sales').select('total_amount, customer_name, currency')
      .eq('business_id', businessId).gte('created_at', monthStart),
    supabase.from('sales').select('total_amount, currency')
      .eq('business_id', businessId),
  ]);

  const sum = (rows: any[] | null) =>
    (rows ?? []).reduce((s: number, r: any) => s + toHtg(parseFloat(r.total_amount ?? 0), r.currency), 0);

  // Top client this month
  const clientTotals: Record<string, number> = {};
  for (const r of monthly.data ?? []) {
    if (r.customer_name) {
      clientTotals[r.customer_name] = (clientTotals[r.customer_name] ?? 0) + toHtg(parseFloat(r.total_amount ?? 0), r.currency);
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
  let supabase: any, businessId: string, exchangeRate: number;
  try {
    const ctx = await getBusinessContext();
    supabase = ctx.supabase; businessId = ctx.businessId; exchangeRate = ctx.exchangeRate;
  } catch { return []; }

  const { data } = await supabase
    .from('sales')
    .select('customer_name, total_amount, currency, payment_method, created_at')
    .eq('business_id', businessId)
    .not('customer_name', 'is', null)
    .order('created_at', { ascending: false });

  const map = new Map<string, ClientSummary>();
  for (const row of (data ?? [])) {
    const name = row.customer_name ?? 'Anonim';
    const amt  = parseFloat(String(row.total_amount ?? 0));
    const amtHtg = (row.currency ?? 'HTG').toUpperCase() === 'USD' ? amt * exchangeRate : amt;
    if (!map.has(name)) {
      map.set(name, { name, total: 0, count: 0, lastDate: row.created_at, methods: [] });
    }
    const c = map.get(name)!;
    c.total += amtHtg;
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
