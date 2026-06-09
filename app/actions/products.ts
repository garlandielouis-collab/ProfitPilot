'use server';

import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { revalidatePath } from 'next/cache';

export type ProductPayload = {
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
};

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
    .select('id,name,category,purchase_price,sale_price,stock_quantity,image_url,currency')
    .eq('user_id', userId)
    .order('name');

  if (error) throw new Error(error.message);
  return (data ?? []) as Product[];
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
  }).select('id').single();

  if (error) throw new Error(error.message);
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

  const { error } = await supabase
    .from('products')
    .update(fields)
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
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
  revalidatePath('/products');
}
