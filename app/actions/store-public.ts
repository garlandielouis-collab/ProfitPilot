'use server';

import { getSupabaseService } from '../../lib/supabaseServiceClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StoreSettings = {
  id:               string;
  business_id:      string;
  slug:             string;
  is_active:        boolean;
  store_name:       string | null;
  tagline:          string | null;
  logo_url:         string | null;
  banner_url:       string | null;
  banner_text:      string | null;
  primary_color:    string;
  secondary_color:  string;
  show_prices:      boolean;
  show_stock:       boolean;
  currency:         string;
  payment_methods:  string[];
  shipping_modes:   ShippingMode[];
  meta_title:       string | null;
  meta_description: string | null;
  contact_email:    string | null;
  contact_phone:    string | null;
  contact_address:  string | null;
  social_links:     Record<string, string>;
};

export type ShippingMode = {
  id:    string;
  label: string;
  price: number;
  days:  string;
};

export type StoreProduct = {
  id:          string;
  name:        string;
  description: string | null;
  price:       number;
  sale_price:  number | null;
  image_url:   string | null;
  images:      string[];
  category_id: string | null;
  category:    string | null;
  stock:       number;
  is_featured: boolean;
  is_new:      boolean;
  created_at:  string;
};

export type StoreCategory = {
  id:    string;
  name:  string;
  count: number;
};

export type CreateOrderInput = {
  business_id:      string;
  customer_name:    string;
  customer_email:   string;
  customer_phone:   string;
  shipping_address: {
    line1:       string;
    line2?:      string;
    city:        string;
    country:     string;
  };
  shipping_mode:    string;
  payment_method:   string;
  notes?:           string;
  items: Array<{
    product_id:   string;
    product_name: string;
    product_image: string | null;
    quantity:     number;
    unit_price:   number;
  }>;
};

// ─── Get store by slug ────────────────────────────────────────────────────────

export async function getStoreBySlug(slug: string): Promise<StoreSettings | null> {
  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('store_settings')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return data as StoreSettings;
}

// ─── Resolve owner_id from business_id ────────────────────────────────────────

async function getOwnerIdFromBusiness(businessId: string): Promise<string | null> {
  const svc = getSupabaseService();
  const { data } = await svc
    .from('businesses')
    .select('owner_id')
    .eq('id', businessId)
    .maybeSingle();
  return (data as any)?.owner_id ?? null;
}

// ─── Get products for store ───────────────────────────────────────────────────
// Products are stored with user_id (owner), not business_id.
// Real columns: name, category (text), sale_price (retail), purchase_price, stock_quantity, image_url, currency

export async function getStoreProducts(
  businessId: string,
  opts?: {
    category?: string;
    search?:   string;
    sort?:     'price_asc' | 'price_desc' | 'newest' | 'name';
    featured?: boolean;
    limit?:    number;
  },
): Promise<StoreProduct[]> {
  const svc = getSupabaseService();

  const ownerId = await getOwnerIdFromBusiness(businessId);
  if (!ownerId) return [];

  let q = svc
    .from('products')
    .select('id, name, category, sale_price, purchase_price, image_url, stock_quantity, currency, created_at')
    .eq('user_id', ownerId)
    .gte('stock_quantity', 0); // show all, including 0-stock (filtered by UI)

  if (opts?.category) q = q.eq('category', opts.category);
  if (opts?.search)   q = q.ilike('name', `%${opts.search}%`);

  switch (opts?.sort) {
    case 'price_asc':  q = q.order('sale_price', { ascending: true });  break;
    case 'price_desc': q = q.order('sale_price', { ascending: false }); break;
    case 'newest':     q = q.order('created_at', { ascending: false }); break;
    default:           q = q.order('name', { ascending: true }); break;
  }

  if (opts?.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  if (error || !data) return [];

  return data.map((p: any) => mapProduct(p));
}

function mapProduct(p: any): StoreProduct {
  return {
    id:          p.id,
    name:        p.name,
    description: null,
    price:       Number(p.sale_price ?? p.purchase_price ?? 0),
    sale_price:  null, // no separate discount price in this schema
    image_url:   p.image_url ?? null,
    images:      [],
    category_id: null,
    category:    p.category ?? null,
    stock:       Number(p.stock_quantity ?? 0),
    is_featured: false,
    is_new:      isNew(p.created_at),
    created_at:  p.created_at,
  };
}

function isNew(createdAt: string): boolean {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  return days <= 30;
}

// ─── Get single product ───────────────────────────────────────────────────────

export async function getStoreProduct(businessId: string, productId: string): Promise<StoreProduct | null> {
  const svc = getSupabaseService();

  const ownerId = await getOwnerIdFromBusiness(businessId);
  if (!ownerId) return null;

  const { data, error } = await svc
    .from('products')
    .select('id, name, category, sale_price, purchase_price, image_url, stock_quantity, currency, created_at')
    .eq('id', productId)
    .eq('user_id', ownerId)
    .maybeSingle();

  if (error || !data) return null;
  return mapProduct(data as any);
}

// ─── Get categories ───────────────────────────────────────────────────────────
// Products use a plain text `category` column — derive distinct values from products.

export async function getStoreCategories(businessId: string): Promise<StoreCategory[]> {
  const svc = getSupabaseService();

  const ownerId = await getOwnerIdFromBusiness(businessId);
  if (!ownerId) return [];

  const { data, error } = await svc
    .from('products')
    .select('category')
    .eq('user_id', ownerId)
    .not('category', 'is', null);

  if (error || !data) return [];

  const countMap = new Map<string, number>();
  for (const row of data as any[]) {
    if (row.category) {
      countMap.set(row.category, (countMap.get(row.category) ?? 0) + 1);
    }
  }

  // Use category name as id so URL filter param matches directly
  return [...countMap.entries()]
    .map(([name, count]) => ({ id: name, name, count }))
    .sort((a, b) => b.count - a.count);
}

// ─── Create order (guest checkout) ───────────────────────────────────────────

export async function createStoreOrder(input: CreateOrderInput): Promise<{ orderId: string; orderNumber: string }> {
  const svc = getSupabaseService();

  // Generate order number
  const year = new Date().getFullYear();
  const { count } = await svc
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', input.business_id);
  const orderNumber = `ORD-${year}-${String((count ?? 0) + 1).padStart(5, '0')}`;

  // Compute totals
  const subtotal = input.items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const shipping  = await getShippingPrice(input.business_id, input.shipping_mode);
  const total     = subtotal + shipping;

  // Upsert customer
  const { data: customer } = await svc
    .from('customers')
    .upsert({
      business_id: input.business_id,
      email:       input.customer_email.toLowerCase().trim(),
      first_name:  input.customer_name.split(' ')[0] ?? input.customer_name,
      last_name:   input.customer_name.split(' ').slice(1).join(' ') || '-',
      phone:       input.customer_phone,
    }, { onConflict: 'business_id,email' })
    .select('id')
    .single();

  // Create order
  const { data: order, error: orderErr } = await svc
    .from('orders')
    .insert({
      business_id:      input.business_id,
      order_number:     orderNumber,
      customer_id:      customer?.id ?? null,
      customer_name:    input.customer_name,
      customer_email:   input.customer_email.toLowerCase().trim(),
      customer_phone:   input.customer_phone,
      status:           'pending',
      payment_status:   'unpaid',
      payment_method:   input.payment_method,
      subtotal:         parseFloat(subtotal.toFixed(2)),
      shipping_amount:  shipping,
      discount_amount:  0,
      total:            parseFloat(total.toFixed(2)),
      shipping_address: input.shipping_address,
      shipping_mode:    input.shipping_mode,
      notes:            input.notes ?? null,
    })
    .select('id, order_number')
    .single();

  if (orderErr || !order) throw new Error(orderErr?.message ?? 'Erreur création commande');

  // Create order items
  const items = input.items.map((i) => ({
    order_id:      order.id,
    business_id:   input.business_id,
    product_id:    i.product_id,
    product_name:  i.product_name,
    product_image: i.product_image,
    quantity:      i.quantity,
    unit_price:    parseFloat(i.unit_price.toFixed(2)),
    total_price:   parseFloat((i.unit_price * i.quantity).toFixed(2)),
  }));

  await svc.from('order_items').insert(items);

  return { orderId: order.id, orderNumber: order.order_number };
}

async function getShippingPrice(businessId: string, modeId: string): Promise<number> {
  if (!modeId) return 0;
  const svc = getSupabaseService();
  const { data } = await svc
    .from('store_settings')
    .select('shipping_modes')
    .eq('business_id', businessId)
    .maybeSingle();
  const modes = (data?.shipping_modes ?? []) as ShippingMode[];
  return modes.find((m) => m.id === modeId)?.price ?? 0;
}

// ─── Get order (for confirmation page) ───────────────────────────────────────

export async function getOrderByNumber(businessId: string, orderNumber: string) {
  const svc = getSupabaseService();
  const { data, error } = await svc
    .from('orders')
    .select('*, order_items(*)')
    .eq('business_id', businessId)
    .eq('order_number', orderNumber)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}
