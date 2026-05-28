'use server';

import { supabaseServer } from '../../lib/supabaseServerClient';

// ── 12 pwodui mache Ayisyen ───────────────────────────────────────────────────

const DEMO_PRODUCTS = [
  // ── Alimentation ──────────────────────────────────────────────────────────
  { name: 'Riz Blanc 50kg',           category: 'Alimentation',  purchase_price: 2200, sale_price: 2750, stock_quantity:  50 },
  { name: 'Huile Végétale 4L',         category: 'Alimentation',  purchase_price:  850, sale_price: 1100, stock_quantity:  30 },
  { name: 'Sucre en Poudre 5kg',      category: 'Alimentation',  purchase_price:  450, sale_price:  600, stock_quantity:  45 },
  { name: 'Pâte Alimentaire 500g',    category: 'Alimentation',  purchase_price:  120, sale_price:  175, stock_quantity:  80 },
  { name: 'Lait Carnation 410ml',     category: 'Alimentation',  purchase_price:  140, sale_price:  200, stock_quantity:  60 },
  { name: 'Bouillon Maggi (boîte)',   category: 'Alimentation',  purchase_price:   80, sale_price:  125, stock_quantity: 200 },
  { name: 'Haricots Rouges 1kg',     category: 'Alimentation',  purchase_price:  220, sale_price:  300, stock_quantity:  70 },
  { name: 'Farine de Blé 5kg',       category: 'Alimentation',  purchase_price:  380, sale_price:  520, stock_quantity:  35 },
  // ── Hygiène & Entretien ───────────────────────────────────────────────────
  { name: 'Savon Lux (boîte 50u)',   category: 'Hygiène',       purchase_price:  180, sale_price:  250, stock_quantity: 100 },
  { name: 'Détergent Ajax 1kg',      category: 'Entretien',     purchase_price:  350, sale_price:  480, stock_quantity:  40 },
  // ── Boissons ──────────────────────────────────────────────────────────────
  { name: 'Eau Minérale 1.5L (cais.)',category: 'Boissons',      purchase_price:  450, sale_price:  650, stock_quantity:  25 },
  { name: 'Jus Tropicana 1L',        category: 'Boissons',      purchase_price:  180, sale_price:  260, stock_quantity:  48 },
] as const;

// ── seedDemoProducts ──────────────────────────────────────────────────────────
// Insère sèlman pwodui ki pa egziste deja (pa non).
// Retounen: { inserted, skipped, error? }

export async function seedDemoProducts(): Promise<{
  inserted: number;
  skipped: number;
  error?: string;
}> {
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return { inserted: 0, skipped: 0, error: 'Non authentifié.' };

  // Fetch existing product names for this owner
  const { data: existing, error: fetchErr } = await supabaseServer
    .from('products')
    .select('name')
    .eq('owner_id', user.id);

  if (fetchErr) return { inserted: 0, skipped: 0, error: fetchErr.message };

  const existingNames = new Set((existing ?? []).map((p: any) => p.name as string));

  // Filter out products that already exist by name
  const toInsert = DEMO_PRODUCTS.filter(p => !existingNames.has(p.name));

  if (toInsert.length === 0) {
    return { inserted: 0, skipped: DEMO_PRODUCTS.length };
  }

  const rows = toInsert.map(p => ({ ...p, owner_id: user.id }));
  const { error, data } = await supabaseServer
    .from('products')
    .insert(rows)
    .select('id');

  if (error) return { inserted: 0, skipped: DEMO_PRODUCTS.length - toInsert.length, error: error.message };

  return {
    inserted: (data ?? []).length,
    skipped:  DEMO_PRODUCTS.length - toInsert.length,
  };
}
