'use server';

import { revalidatePath } from 'next/cache';
import { getBusinessContext, requirePermission } from '../../lib/serverAuth';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import type { StoreSettings, ShippingMode } from './store-public';

// ─── Store settings ───────────────────────────────────────────────────────────

export async function getMyStoreSettings(): Promise<StoreSettings | null> {
  const { supabase, businessId } = await getBusinessContext();
  const { data } = await supabase
    .from('store_settings')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle();
  return (data as StoreSettings | null);
}

export async function upsertStoreSettings(
  settings: Partial<Omit<StoreSettings, 'id' | 'business_id' | 'slug'>> & { slug?: string },
): Promise<void> {
  await requirePermission('settings:write');
  const { businessId } = await getBusinessContext();
  const svc = getSupabaseService();

  // Generate slug from business name if not provided
  if (!settings.slug) {
    const { data: biz } = await svc
      .from('businesses')
      .select('name')
      .eq('id', businessId)
      .single();
    settings.slug = slugify((biz as any)?.name ?? businessId);
  }

  const { error: upsertErr } = await svc.from('store_settings').upsert(
    { ...settings, business_id: businessId },
    { onConflict: 'business_id' },
  );
  if (upsertErr) throw new Error('Erreur sauvegarde boutique: ' + upsertErr.message);
  revalidatePath('/boutique');
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ─── Preview products (bypasses is_active check) ─────────────────────────────

export async function getStorePreviewData(): Promise<{
  settings: StoreSettings | null;
  products: Array<{
    id: string; name: string; description: string | null;
    price: number; sale_price: number | null;
    image_url: string | null; category: string | null;
    stock_quantity: number; is_featured: boolean; created_at: string;
  }>;
}> {
  // Products are created with user_id, not business_id — query by user_id
  const { supabase, userId, businessId } = await getBusinessContext();

  const [settingsRes, productsRes] = await Promise.all([
    supabase.from('store_settings').select('*').eq('business_id', businessId).maybeSingle(),
    supabase
      .from('products')
      .select('id, name, category, sale_price, purchase_price, image_url, stock_quantity, currency, created_at')
      .eq('user_id', userId)
      .order('name', { ascending: true })
      .limit(100),
  ]);

  const products = (productsRes.data ?? []).map((p: any) => ({
    id:             p.id,
    name:           p.name,
    description:    null,
    price:          Number(p.sale_price ?? p.purchase_price ?? 0),
    sale_price:     null,
    image_url:      p.image_url ?? null,
    category:       p.category ?? null,
    stock_quantity: Number(p.stock_quantity ?? 0),
    is_featured:    false,
    created_at:     p.created_at,
  }));

  return { settings: settingsRes.data as StoreSettings | null, products };
}

// ─── Netlify deployment token storage ─────────────────────────────────────────

export async function saveNetlifyToken(token: string): Promise<void> {
  await requirePermission('settings:write');
  const { businessId } = await getBusinessContext();
  const svc = getSupabaseService();
  await svc.from('store_settings').upsert(
    { business_id: businessId, netlify_token: token } as any,
    { onConflict: 'business_id' },
  );
}

export async function getNetlifyToken(): Promise<string | null> {
  const { supabase, businessId } = await getBusinessContext();
  const { data } = await supabase
    .from('store_settings')
    .select('netlify_token, netlify_site_id, netlify_site_url')
    .eq('business_id', businessId)
    .maybeSingle();
  return (data as any) ?? null;
}

export async function saveNetlifySiteInfo(siteId: string, siteUrl: string): Promise<void> {
  const { businessId } = await getBusinessContext();
  const svc = getSupabaseService();
  await svc.from('store_settings').upsert(
    { business_id: businessId, netlify_site_id: siteId, netlify_site_url: siteUrl } as any,
    { onConflict: 'business_id' },
  );
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export type OrderRow = {
  id:              string;
  order_number:    string;
  customer_name:   string;
  customer_email:  string;
  customer_phone:  string | null;
  status:          string;
  payment_status:  string;
  payment_method:  string | null;
  subtotal:        number;
  shipping_amount: number;
  discount_amount: number;
  total:           number;
  currency:        string;
  shipping_address: any;
  shipping_mode:   string | null;
  notes:           string | null;
  tracking_number: string | null;
  sale_id:         string | null;
  created_at:      string;
  updated_at:      string;
  order_items:     OrderItem[];
};

export type OrderItem = {
  id:            string;
  product_id:    string | null;
  product_name:  string;
  product_image: string | null;
  quantity:      number;
  unit_price:    number;
  total_price:   number;
};

export async function listOrders(opts?: {
  status?: string;
  search?: string;
  limit?:  number;
  offset?: number;
}): Promise<{ orders: OrderRow[]; total: number }> {
  const { supabase, businessId } = await getBusinessContext();

  let q = supabase
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .eq('business_id', businessId);

  if (opts?.status && opts.status !== 'all') q = q.eq('status', opts.status);
  if (opts?.search) {
    q = q.or(`order_number.ilike.%${opts.search}%,customer_name.ilike.%${opts.search}%,customer_email.ilike.%${opts.search}%`);
  }

  q = q.order('created_at', { ascending: false });
  if (opts?.limit)  q = (q as any).limit(opts.limit);
  if (opts?.offset) q = (q as any).range(opts.offset, (opts.offset + (opts?.limit ?? 20)) - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { orders: (data ?? []) as OrderRow[], total: count ?? 0 };
}

export async function getOrder(orderId: string): Promise<OrderRow | null> {
  const { supabase, businessId } = await getBusinessContext();
  const { data } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .eq('business_id', businessId)
    .maybeSingle();
  return data as OrderRow | null;
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
  trackingNumber?: string,
): Promise<void> {
  await requirePermission('sales:update');
  const { businessId } = await getBusinessContext();
  const svc = getSupabaseService();

  const update: any = { status };
  if (trackingNumber) update.tracking_number = trackingNumber;
  if (status === 'confirmed') update.payment_status = 'paid';

  await svc.from('orders').update(update).eq('id', orderId).eq('business_id', businessId);

  // When confirming: create ProfitPilot sale + decrement stock
  if (status === 'confirmed') {
    await confirmOrderAsSale(orderId, businessId);
  }

  revalidatePath('/boutique/commandes');
}

async function confirmOrderAsSale(orderId: string, businessId: string) {
  const svc = getSupabaseService();

  const { data: order } = await svc
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.sale_id) return; // already integrated

  // Get exchange rate
  const { data: biz } = await svc
    .from('businesses')
    .select('exchange_rate, default_currency')
    .eq('id', businessId)
    .single();

  const exchangeRate = Number((biz as any)?.exchange_rate ?? 130);

  // Create sale
  const year = new Date().getFullYear();
  const { count } = await svc.from('sales').select('*', { count: 'exact', head: true }).eq('business_id', businessId);
  const invoiceNumber = `INV-${year}-${String((count ?? 0) + 1).padStart(5, '0')}`;

  const items = (order.order_items ?? []) as any[];
  const subtotal = items.reduce((s: number, i: any) => s + Number(i.total_price), 0);

  const { data: sale } = await svc
    .from('sales')
    .insert({
      business_id:     businessId,
      invoice_number:  invoiceNumber,
      client_name:     order.customer_name,
      sale_date:       new Date().toISOString().split('T')[0],
      total_amount:    parseFloat(order.total),
      discount_amount: 0,
      currency:        order.currency ?? 'HTG',
      exchange_rate:   exchangeRate,
      payment_method:  order.payment_method ?? 'cash',
      notes:           `Commande boutique #${order.order_number}`,
    })
    .select('id')
    .single();

  if (!sale) return;

  // Create sale items and decrement stock
  for (const item of items) {
    await svc.from('sale_items').insert({
      sale_id:      sale.id,
      business_id:  businessId,
      product_id:   item.product_id,
      product_name: item.product_name,
      quantity:     item.quantity,
      unit_price:   Number(item.unit_price),
      total_price:  Number(item.total_price),
    }); // ignore if sale_items doesn't exist

    // Decrement stock
    if (item.product_id) {
      const { data: prod } = await svc
        .from('products')
        .select('stock_quantity')
        .eq('id', item.product_id)
        .maybeSingle();
      if (prod) {
        const newStock = Math.max(0, Number((prod as any).stock_quantity ?? 0) - item.quantity);
        await svc.from('products').update({ stock_quantity: newStock }).eq('id', item.product_id);
      }
    }
  }

  // Link sale to order
  await svc.from('orders').update({ sale_id: sale.id }).eq('id', orderId);
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export type StoreStats = {
  totalRevenue:     number;
  totalOrders:      number;
  avgOrderValue:    number;
  conversionPct:    number;
  pendingOrders:    number;
  revenueByDay:     Array<{ date: string; total: number }>;
  topProducts:      Array<{ name: string; qty: number; revenue: number }>;
  statusBreakdown:  Record<string, number>;
};

export async function getStoreStats(days = 30): Promise<StoreStats> {
  const { supabase, businessId } = await getBusinessContext();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: orders } = await supabase
    .from('orders')
    .select('id, status, total, created_at')
    .eq('business_id', businessId)
    .gte('created_at', since);

  const { data: items } = await supabase
    .from('order_items')
    .select('product_name, quantity, total_price, orders(status)')
    .eq('business_id', businessId)
    .gte('created_at', since);

  const rows = (orders ?? []) as any[];
  const paid  = rows.filter((o) => !['cancelled', 'refunded'].includes(o.status));

  const totalRevenue  = paid.reduce((s: number, o: any) => s + Number(o.total), 0);
  const totalOrders   = paid.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Revenue by day
  const byDay: Record<string, number> = {};
  for (const o of paid) {
    const d = o.created_at.slice(0, 10);
    byDay[d] = (byDay[d] ?? 0) + Number(o.total);
  }
  const revenueByDay = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }));

  // Top products
  const prodMap: Record<string, { qty: number; revenue: number }> = {};
  for (const i of (items ?? []) as any[]) {
    if (['cancelled', 'refunded'].includes((i.orders as any)?.status)) continue;
    if (!prodMap[i.product_name]) prodMap[i.product_name] = { qty: 0, revenue: 0 };
    prodMap[i.product_name].qty     += i.quantity;
    prodMap[i.product_name].revenue += Number(i.total_price);
  }
  const topProducts = Object.entries(prodMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Status breakdown
  const statusBreakdown: Record<string, number> = {};
  for (const o of rows) {
    statusBreakdown[o.status] = (statusBreakdown[o.status] ?? 0) + 1;
  }

  return {
    totalRevenue:    parseFloat(totalRevenue.toFixed(2)),
    totalOrders,
    avgOrderValue:   parseFloat(avgOrderValue.toFixed(2)),
    conversionPct:   0, // requires visitor tracking
    pendingOrders:   rows.filter((o: any) => o.status === 'pending').length,
    revenueByDay,
    topProducts,
    statusBreakdown,
  };
}
