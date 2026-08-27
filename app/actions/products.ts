'use server';

import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { revalidatePath } from 'next/cache';
import { logActivity } from '../../lib/activityLog';

// Frais annexes (Diagnostic 4). Ils sont exprimés dans la MÊME devise que
// `purchase_price` — sinon le coût complet ne veut rien dire.
export type ProductCostFields = {
  delivery_cost?: number;
  packaging_cost?: number;
  other_cost?: number;
  commission_percent?: number;
  target_margin_percent?: number;
  reorder_point?: number;
};

export type ProductPayload = ProductCostFields & {
  name: string;
  category?: string | null;
  purchase_price: number;
  sale_price: number;
  stock_quantity: number;
  image_url?: string | null;
  currency?: 'HTG' | 'USD';
};

export type Product = {
  id: string;
  name: string;
  category: string | null;
  purchase_price: number;
  sale_price: number;
  stock_quantity: number;
  image_url: string | null;
  currency: 'HTG' | 'USD';
  delivery_cost: number;
  packaging_cost: number;
  other_cost: number;
  commission_percent: number;
  target_margin_percent: number;
  reorder_point: number;
};

const BASE_COLUMNS =
  'id,name,category,purchase_price,sale_price,stock_quantity,image_url,currency';

// Colonnes ajoutées par 20260821_profitpilot_features.sql. Lues à part : si la
// migration n'a pas encore été jouée, on sert le catalogue de base plutôt que
// de casser la page produits.
const COST_COLUMNS =
  'delivery_cost,packaging_cost,other_cost,commission_percent,target_margin_percent,reorder_point';

const COST_DEFAULTS = {
  delivery_cost:         0,
  packaging_cost:        0,
  other_cost:            0,
  commission_percent:    0,
  target_margin_percent: 30,
  reorder_point:         5,
};

const clamp = (n: number, min: number, max: number): number =>
  Math.min(Math.max(Number.isFinite(Number(n)) ? Number(n) : min, min), max);

/** Ne renvoie que les frais réellement fournis, bornés à des valeurs saines. */
function costFields(payload: ProductCostFields): Record<string, number> {
  const out: Record<string, number> = {};
  if (payload.delivery_cost         !== undefined) out.delivery_cost         = clamp(payload.delivery_cost, 0, 1e12);
  if (payload.packaging_cost        !== undefined) out.packaging_cost        = clamp(payload.packaging_cost, 0, 1e12);
  if (payload.other_cost            !== undefined) out.other_cost            = clamp(payload.other_cost, 0, 1e12);
  if (payload.commission_percent    !== undefined) out.commission_percent    = clamp(payload.commission_percent, 0, 100);
  if (payload.target_margin_percent !== undefined) out.target_margin_percent = clamp(payload.target_margin_percent, 0, 95);
  if (payload.reorder_point         !== undefined) out.reorder_point         = Math.round(clamp(payload.reorder_point, 0, 1e6));
  return out;
}

async function getAuthUser() {
  const supabase = await getSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Non authentifié.');
  return { supabase, userId: user.id };
}

export async function getProductsAction(): Promise<Product[]> {
  const { supabase, userId } = await getAuthUser();

  const { data, error } = await supabase
    .from('products')
    .select(BASE_COLUMNS + ',' + COST_COLUMNS)
    .eq('user_id', userId)
    .order('name');

  if (!error) return (data ?? []).map((p: any) => ({ ...COST_DEFAULTS, ...p })) as Product[];

  const { data: fallback, error: fallbackError } = await supabase
    .from('products')
    .select(BASE_COLUMNS)
    .eq('user_id', userId)
    .order('name');

  if (fallbackError) throw new Error(fallbackError.message);
  return (fallback ?? []).map((p: any) => ({ ...COST_DEFAULTS, ...p })) as Product[];
}

export async function createProductAction(payload: ProductPayload): Promise<string> {
  const { supabase, userId } = await getAuthUser();

  const { data, error } = await supabase.from('products').insert({
    user_id:        userId,
    name:           payload.name.trim(),
    category:       payload.category?.trim() || null,
    purchase_price: payload.purchase_price,
    sale_price:     payload.sale_price,
    stock_quantity: payload.stock_quantity,
    currency:       payload.currency ?? 'HTG',
    image_url:      payload.image_url ?? null,
    ...costFields(payload),
  }).select('id').single();

  if (error) throw new Error(error.message);
  void logActivity({ action: 'create', entity: 'product', entityId: data.id, newValues: { name: payload.name, sale_price: payload.sale_price } });
  revalidatePath('/products');
  return data.id;
}

export async function updateProductAction(id: string, payload: ProductPayload): Promise<void> {
  const { supabase, userId } = await getAuthUser();

  const fields: any = {
    name:           payload.name.trim(),
    category:       payload.category?.trim() || null,
    purchase_price: payload.purchase_price,
    sale_price:     payload.sale_price,
    stock_quantity: payload.stock_quantity,
  };
  if (payload.image_url !== undefined) fields.image_url = payload.image_url;
  Object.assign(fields, costFields(payload));

  const { error } = await supabase
    .from('products')
    .update(fields)
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  void logActivity({ action: 'update', entity: 'product', entityId: id, newValues: { name: payload.name, sale_price: payload.sale_price, stock_quantity: payload.stock_quantity } });
  revalidatePath('/products');
}

export async function deleteProductAction(id: string): Promise<void> {
  const { supabase, userId } = await getAuthUser();

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  void logActivity({ action: 'delete', entity: 'product', entityId: id });
  revalidatePath('/products');
}
