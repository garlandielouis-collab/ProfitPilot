'use server';

import { supabaseServer } from '../../lib/supabaseServerClient';
import { revalidatePath } from 'next/cache';
import { recordCustomerTransaction } from './invoice';

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
  client_id?: string;
  client_name?: string;
  owner_id?: string;
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
    client_id,
    client_name,
    owner_id,
    metadata,
  } = payload;

  if (!items?.length) throw new Error('Le panier est vide.');
  if (!['Cash', 'MonCash', 'Natcash', 'Card'].includes(payment_method)) throw new Error('Mode de paiement invalide.');
  if (discount_percent < 0 || discount_percent > 100) throw new Error('Remise invalide (0–100%).');
  if (is_credit && !client_name?.trim()) throw new Error('Un client est requis pour une vente à crédit.');

  let uid = owner_id;
  if (!uid) {
    const { data: { user } } = await supabaseServer.auth.getUser();
    uid = user?.id;
  }
  if (!uid) throw new Error('Non authentifié.');

  const invoiceNumber = generateInvoiceNumber();
  const multiplier = 1 - discount_percent / 100;
  const payment_status = is_credit ? 'À Crédit' : 'Payé';

  let subtotal = 0;
  const firstSaleIds: string[] = [];

  for (const item of items) {
    if (!item.product_id || item.quantity < 1 || item.unit_price <= 0) {
      throw new Error(`Données invalides pour "${item.product_name}".`);
    }

    // Validate stock
    const { data: product, error: pErr } = await supabaseServer
      .from('products')
      .select('stock_quantity')
      .eq('id', item.product_id)
      .eq('owner_id', uid)
      .single();

    if (pErr || !product) throw new Error(`Produit introuvable: ${item.product_name}`);
    if (product.stock_quantity < item.quantity) {
      throw new Error(`Stock insuffisant pour "${item.product_name}" (disponible: ${product.stock_quantity}).`);
    }

    const lineTotal = parseFloat((item.unit_price * item.quantity * multiplier).toFixed(2));
    subtotal += item.unit_price * item.quantity;

    const { data: saleRow, error: sErr } = await supabaseServer
      .from('sales')
      .insert({
        owner_id: uid,
        product_id: item.product_id,
        quantity: item.quantity,
        total_amount: lineTotal,
        currency,
        payment_method,
        payment_status,
        discount_percent,
        client_id: client_id ?? null,
        client_name: client_name ?? null,
        invoice_number: invoiceNumber,
        metadata: metadata ?? null,
      })
      .select('id')
      .single();

    if (sErr) throw new Error(sErr.message);
    if (saleRow?.id) firstSaleIds.push(saleRow.id);
    // Stock is decremented automatically by the sales_decrement_stock_trigger (BEFORE INSERT on sales).
  }

  subtotal = parseFloat(subtotal.toFixed(2));
  const discountAmount = parseFloat((subtotal * (discount_percent / 100)).toFixed(2));
  const totalAmount = parseFloat((subtotal - discountAmount).toFixed(2));

  // Credit sale: create client_credits entry + update client total
  if (is_credit) {
    const { error: ccErr } = await supabaseServer
      .from('client_credits')
      .insert({
        owner_id: uid,
        sale_id: firstSaleIds[0] ?? null,
        client_id: client_id ?? null,
        client_name: client_name!,
        invoice_number: invoiceNumber,
        amount: totalAmount,
        currency,
        payment_status: 'À Crédit',
      });

    if (ccErr) throw new Error(ccErr.message);

    if (client_id) {
      const { data: cl } = await supabaseServer
        .from('clients')
        .select('total_credit')
        .eq('id', client_id)
        .single();

      if (cl) {
        await supabaseServer
          .from('clients')
          .update({ total_credit: parseFloat(((cl.total_credit ?? 0) + totalAmount).toFixed(2)) })
          .eq('id', client_id);
      }
    }
  }

  // ── Record customer transaction (non-blocking) ────────────────────────────
  if (client_name?.trim()) {
    recordCustomerTransaction({
      owner_id:       uid,
      client_id:      client_id ?? undefined,
      client_name:    client_name,
      sale_id:        firstSaleIds[0] ?? undefined,
      invoice_number: invoiceNumber,
      type:           'sale',
      amount:         totalAmount,
      currency,
      payment_method: is_credit ? 'À Crédit' : payment_method,
    }).catch(() => { /* non-critical */ });
  }

  revalidatePath('/sales');
  revalidatePath('/dettes');

  return { invoiceNumber, subtotal, discountAmount, totalAmount };
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export type SalesMetrics = {
  monthlyTotal: number;
  allTimeTotal: number;
};

export async function getSalesMetrics(): Promise<SalesMetrics> {
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return { monthlyTotal: 0, allTimeTotal: 0 };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [monthly, allTime] = await Promise.all([
    supabaseServer
      .from('sales')
      .select('total_amount')
      .eq('owner_id', user.id)
      .gte('created_at', monthStart),
    supabaseServer
      .from('sales')
      .select('total_amount')
      .eq('owner_id', user.id),
  ]);

  const sum = (rows: any[] | null) =>
    (rows ?? []).reduce((s: number, r: any) => s + parseFloat(r.total_amount ?? 0), 0);

  return {
    monthlyTotal: parseFloat(sum(monthly.data).toFixed(2)),
    allTimeTotal: parseFloat(sum(allTime.data).toFixed(2)),
  };
}
