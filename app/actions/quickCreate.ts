'use server';

import { getSupabaseServer } from '../../lib/supabaseServerClient';
import { getBusinessContext } from '../../lib/serverAuth';
import { debugAuth } from '../../lib/authDebugLog';
import { PlanLimitError, getActivePlanKey } from '../../lib/entitlements';
import { productAllowance } from '../../lib/quotas';
import { getPlanLabel } from '../../lib/plans';
import { SIGNUP_PRODUCT_SLOTS } from '../../lib/referral';
import { attempt, UserFacingError, type ActionResult } from '../../lib/actionResult';

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
}): Promise<ActionResult<QuickSupplierResult>> {
  return attempt(async () => {
  // Verify auth is working
  const debug = await debugAuth('quickCreateSupplier()');
  if (!debug.success) throw new Error(debug.error);

  if (!payload.name?.trim()) throw new UserFacingError('Non founisè obligatwa.');

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
  });
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
}): Promise<ActionResult<QuickProductResult>> {
  return attempt(async () => {
  // Verify auth is working
  const debug = await debugAuth('quickCreateProduct()');
  if (!debug.success) throw new Error(debug.error);

  if (!payload.name?.trim())     throw new UserFacingError('Non pwodui obligatwa.');
  if (!payload.category?.trim()) throw new UserFacingError('Kategori obligatwa.');
  if (payload.purchase_price < 0) throw new UserFacingError('Pri acha pa valab.');
  if (payload.sale_price < 0)     throw new UserFacingError('Pri vant pa valab.');

  // Get authenticated user + business
  const { supabase, userId, businessId } = await getBusinessContext();

  // ── Le plafond du catalogue ───────────────────────────────────────────────
  //
  // La création rapide depuis un achat écrit une fiche produit exactement comme
  // la création normale : elle doit buter sur le même mur. Sans ce contrôle, un
  // marchand Esansyel au plafond passait par l'écran Achats et « Jusqu'à 50
  // produits » redevenait une phrase.
  await assertProductSlotAvailable(supabase, businessId);

  const { data, error } = await supabase
    .from('products')
    .insert({
      user_id:        userId,
      business_id:    businessId,
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
  });
}

/**
 * Lève une `PlanLimitError` si une fiche de plus dépasserait le plafond.
 *
 * Même compte et même message que `createProductAction` (app/actions/products.ts).
 * Dupliqué plutôt qu'importé : tout export d'un fichier 'use server' devient une
 * action appelable depuis le navigateur, et ce contrôle n'a pas à l'être.
 */
async function assertProductSlotAvailable(supabase: any, businessId: string): Promise<void> {
  const max = await productAllowance();
  if (!Number.isFinite(max)) return;

  // Compté par entreprise, comme le catalogue lui-même (bonus de parrainage
  // compris dans `productAllowance`).
  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);

  // Un comptage qui échoue ne doit pas empêcher d'enregistrer un produit :
  // le catalogue est le socle, pas une fonction payante.
  if (error) return;

  const current = count ?? 0;
  if (current < max) return;

  const planLabel = getPlanLabel(await getActivePlanKey());
  throw new PlanLimitError(
    max,
    current,
    `Votre catalogue est plein : l'offre ${planLabel} couvre ${max} fiches produits. `
      + `Passez à ${getPlanLabel('Business Pilot')} pour un catalogue sans limite, `
      + `ou amenez un marchand — chaque filleul inscrit ajoute ${SIGNUP_PRODUCT_SLOTS} fiches.`,
  );
}




