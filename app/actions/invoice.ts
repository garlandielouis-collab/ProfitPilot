'use server';

import { getBusinessContext } from '../../lib/serverAuth';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InvoiceLineItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  discount_percent: number;
};

export type InvoiceData = {
  invoice_number: string;
  client_name: string | null;
  client_id: string | null;
  business_name: string;
  payment_method: string;
  payment_status: string;
  currency: string;
  date: string;
  items: InvoiceLineItem[];
  subtotal: number;
  discount_amount: number;
  total: number;
};

// ── getInvoiceDetails ─────────────────────────────────────────────────────────

export async function getInvoiceDetails(invoiceNumber: string): Promise<InvoiceData | null> {
  const { supabase, businessId } = await getBusinessContext();

  // 1. Fetch sale header
  const { data: sale, error: sErr } = await supabase
    .from('sales')
    .select(`
      id,
      invoice_number,
      customer_id,
      customer_name,
      total_amount,
      subtotal_amount,
      discount_amount,
      discount_percent,
      payment_method,
      payment_status,
      currency,
      sale_date,
      created_at
    `)
    .eq('invoice_number', invoiceNumber)
    .eq('business_id', businessId)
    .single();

  if (sErr || !sale) return null;

  // 2. Fetch sale_items
  const { data: rawItems } = await supabase
    .from('sale_items')
    .select('id, product_name, quantity, unit_price, line_total, discount_percent')
    .eq('sale_id', sale.id)
    .order('created_at', { ascending: true });

  const items: InvoiceLineItem[] = (rawItems ?? []).map((r: any) => ({
    id:               r.id,
    product_name:     r.product_name ?? '—',
    quantity:         Number(r.quantity),
    unit_price:       Number(r.unit_price),
    line_total:       Number(r.line_total),
    discount_percent: Number(r.discount_percent ?? 0),
  }));

  // 3. Fetch business name
  const { data: biz } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', businessId)
    .single();

  const subtotal       = Number(sale.subtotal_amount ?? 0) || items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const discount_amount = Number(sale.discount_amount ?? 0);
  const total          = Number(sale.total_amount ?? 0);

  // Resolve customer name — prefer stored customer_name, fallback to customers table
  let clientName = sale.customer_name ?? null;
  if (!clientName && sale.customer_id) {
    const { data: cust } = await supabase
      .from('customers')
      .select('name')
      .eq('id', sale.customer_id)
      .single();
    clientName = cust?.name ?? null;
  }

  return {
    invoice_number: sale.invoice_number ?? `#${sale.id.slice(0, 8)}`,
    client_name:    clientName,
    client_id:      sale.customer_id ?? null,
    business_name:  biz?.name ?? 'Mon Entreprise',
    payment_method: sale.payment_method ?? '—',
    payment_status: sale.payment_status ?? 'paid',
    currency:       sale.currency ?? 'HTG',
    date:           sale.sale_date ?? (sale.created_at as string).split('T')[0],
    items,
    subtotal:       parseFloat(subtotal.toFixed(2)),
    discount_amount: parseFloat(discount_amount.toFixed(2)),
    total:          parseFloat(total.toFixed(2)),
  };
}

// ── recordCustomerTransaction (kept for compatibility) ────────────────────────

export async function recordCustomerTransaction(payload: {
  client_id?: string;
  client_name: string;
  sale_id?: string;
  invoice_number?: string;
  type?: 'sale' | 'payment' | 'refund';
  amount: number;
  currency?: string;
  payment_method?: string;
}): Promise<void> {
  const { supabase, businessId, userId } = await getBusinessContext();

  const { error } = await supabase.from('customer_transactions').insert({
    business_id:      businessId,
    customer_id:      payload.client_id      ?? null,
    transaction_date: new Date().toISOString(),
    type:             payload.type           ?? 'sale',
    amount:           payload.amount,
    currency:         payload.currency       ?? 'HTG',
    description:      `Vente — ${payload.invoice_number ?? ''}`,
    reference_type:   'sale',
    reference_id:     payload.sale_id        ?? null,
    created_by:       userId,
  });
  if (error) console.error('[recordCustomerTransaction]', error.message);
}
