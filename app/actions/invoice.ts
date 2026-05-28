'use server';

import { supabaseServer } from '../../lib/supabaseServerClient';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InvoiceLineItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;      // computed: total_amount / qty / (1 – discount/100)
  line_total: number;      // total_amount (after discount per line)
  discount_percent: number;
};

export type InvoiceData = {
  invoice_number: string;
  client_name: string | null;
  client_id: string | null;
  payment_method: string;
  payment_status: string;
  currency: string;
  date: string;            // ISO
  items: InvoiceLineItem[];
  subtotal: number;        // sum of (unit_price × qty) before discount
  discount_amount: number;
  total: number;           // sum of line_totals
};

// ── getInvoiceDetails ─────────────────────────────────────────────────────────

export async function getInvoiceDetails(invoiceNumber: string): Promise<InvoiceData | null> {
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabaseServer
    .from('sales')
    .select(`
      id,
      invoice_number,
      quantity,
      total_amount,
      discount_percent,
      payment_method,
      payment_status,
      client_name,
      client_id,
      currency,
      created_at,
      products(name)
    `)
    .eq('invoice_number', invoiceNumber)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true });

  if (error || !data || data.length === 0) return null;

  const first = data[0] as any;
  const items: InvoiceLineItem[] = data.map((r: any) => {
    const disc  = Number(r.discount_percent ?? 0);
    const qty   = Number(r.quantity);
    const total = Number(r.total_amount);
    // Reverse-compute unit price: total = unit * qty * (1 – disc/100)
    const unit  = disc < 100 ? parseFloat((total / qty / (1 - disc / 100)).toFixed(2)) : 0;
    return {
      id:              r.id,
      product_name:    r.products?.name ?? '—',
      quantity:        qty,
      unit_price:      unit,
      line_total:      total,
      discount_percent: disc,
    };
  });

  const subtotal        = parseFloat(items.reduce((s, i) => s + i.unit_price * i.quantity, 0).toFixed(2));
  const total           = parseFloat(items.reduce((s, i) => s + i.line_total, 0).toFixed(2));
  const discount_amount = parseFloat((subtotal - total).toFixed(2));

  return {
    invoice_number: String(first.invoice_number ?? `#${first.id.slice(0, 8)}`),
    client_name:    first.client_name ?? null,
    client_id:      first.client_id   ?? null,
    payment_method: first.payment_method ?? '—',
    payment_status: first.payment_status ?? 'Payé',
    currency:       first.currency ?? 'HTG',
    date:           (first.created_at as string).split('T')[0],
    items,
    subtotal,
    discount_amount,
    total,
  };
}

// ── recordCustomerTransaction ─────────────────────────────────────────────────

export async function recordCustomerTransaction(payload: {
  owner_id: string;
  client_id?: string;
  client_name: string;
  sale_id?: string;
  invoice_number?: string;
  type?: 'sale' | 'payment' | 'refund';
  amount: number;
  currency?: string;
  payment_method?: string;
}): Promise<void> {
  const { error } = await supabaseServer.from('customer_transactions').insert({
    owner_id:       payload.owner_id,
    client_id:      payload.client_id      ?? null,
    client_name:    payload.client_name,
    sale_id:        payload.sale_id        ?? null,
    invoice_number: payload.invoice_number ?? null,
    type:           payload.type           ?? 'sale',
    amount:         payload.amount,
    currency:       payload.currency       ?? 'HTG',
    payment_method: payload.payment_method ?? null,
  });
  if (error) console.error('[recordCustomerTransaction]', error.message);
}
