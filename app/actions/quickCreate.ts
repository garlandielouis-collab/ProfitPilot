'use server';

import { supabaseServer } from '../../lib/supabaseServerClient';

// ── quickCreateSupplier ───────────────────────────────────────────────────────

export type QuickSupplierResult = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

export async function quickCreateSupplier(payload: {
  name: string;
  phone?: string;
  email?: string;
  owner_id: string;
}): Promise<QuickSupplierResult> {
  if (!payload.name?.trim()) throw new Error('Non founisè obligatwa.');

  const { data, error } = await supabaseServer
    .from('suppliers')
    .insert({
      name:             payload.name.trim(),
      phone:            payload.phone?.trim()  || null,
      email:            payload.email?.trim()  || null,
      discount_percent: 0,
      owner_id:         payload.owner_id,
    })
    .select('id,name,phone,email')
    .single();

  if (error) throw new Error(error.message);
  return data as QuickSupplierResult;
}

// ── quickCreateProduct ────────────────────────────────────────────────────────

export type QuickProductResult = {
  id: string;
  name: string;
  purchase_price: number;
  sale_price: number;
  stock_quantity: number;
  category: string;
};

export async function quickCreateProduct(payload: {
  name: string;
  category: string;
  purchase_price: number;
  sale_price: number;
  owner_id: string;
}): Promise<QuickProductResult> {
  if (!payload.name?.trim())     throw new Error('Non pwodui obligatwa.');
  if (!payload.category?.trim()) throw new Error('Kategori obligatwa.');
  if (payload.purchase_price < 0) throw new Error('Pri acha pa valab.');
  if (payload.sale_price < 0)     throw new Error('Pri vant pa valab.');

  const { data, error } = await supabaseServer
    .from('products')
    .insert({
      name:           payload.name.trim(),
      category:       payload.category.trim(),
      purchase_price: payload.purchase_price,
      sale_price:     payload.sale_price,
      stock_quantity: 0,
      owner_id:       payload.owner_id,
    })
    .select('id,name,purchase_price,sale_price,stock_quantity,category')
    .single();

  if (error) throw new Error(error.message);
  return data as QuickProductResult;
}
