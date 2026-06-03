'use server';

import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { getBusinessContext } from '../../lib/serverAuth';
import { debugAuth } from '../../lib/authDebugLog';

// â”€â”€ quickCreateSupplier â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type QuickSupplierResult = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  discount_percent: number;
};

export async function quickCreateSupplier(payload: {
  name: string;
  phone?: string;
  email?: string;
}): Promise<QuickSupplierResult> {
  // Verify auth is working
  const debug = await debugAuth('quickCreateSupplier()');
  if (!debug.success) throw new Error(debug.error);

  if (!payload.name?.trim()) throw new Error('Non founisÃ¨ obligatwa.');

  // Get authenticated user + business
  const { supabase, businessId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      name:             payload.name.trim(),
      phone:            payload.phone?.trim()  || null,
      email:            payload.email?.trim()  || null,
      discount_percent: 0,
      business_id:      businessId,
    })
    .select('id,name,phone,email,discount_percent')
    .single();

  if (error) throw new Error(error.message);
  return data as QuickSupplierResult;
}

// â”€â”€ quickCreateProduct â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
}): Promise<QuickProductResult> {
  // Verify auth is working
  const debug = await debugAuth('quickCreateProduct()');
  if (!debug.success) throw new Error(debug.error);

  if (!payload.name?.trim())     throw new Error('Non pwodui obligatwa.');
  if (!payload.category?.trim()) throw new Error('Kategori obligatwa.');
  if (payload.purchase_price < 0) throw new Error('Pri acha pa valab.');
  if (payload.sale_price < 0)     throw new Error('Pri vant pa valab.');

  // Get authenticated user + business
  const { supabase, userId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('products')
    .insert({
      user_id:        userId,
      name:           payload.name.trim(),
      category:       payload.category.trim(),
      purchase_price: payload.purchase_price,
      sale_price:     payload.sale_price,
      stock_quantity: 0,
    })
    .select('id,name,purchase_price,sale_price,stock_quantity,category')
    .single();

  if (error) throw new Error(error.message);
  return data as QuickProductResult;
}




