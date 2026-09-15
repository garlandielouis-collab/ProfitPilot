'use server';

import { getBusinessContext } from '../../lib/serverAuth';
import { revalidatePath } from 'next/cache';
import { logActivity } from '../../lib/activityLog';
import { PlanLimitError, getActivePlanKey } from '../../lib/entitlements';
import { productAllowance } from '../../lib/quotas';
import { getPlanLabel } from '../../lib/plans';
import { SIGNUP_PRODUCT_SLOTS } from '../../lib/referral';
import { attempt, type ActionResult } from '../../lib/actionResult';

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

// ── Le cadrage du catalogue ─────────────────────────────────────────────────
//
// Par `business_id`, et non plus par `user_id`.
//
// La table porte les deux depuis longtemps, et l'application lisait tantôt
// l'un, tantôt l'autre : les rapports (`reports.ts`), la sauvegarde
// (`backup.ts`) et le digest hebdomadaire filtraient par entreprise pendant que
// l'écran Produits, l'inventaire et la vitrine filtraient par utilisateur. Deux
// conséquences vécues : un produit créé par un employé n'apparaissait ni dans
// le catalogue du propriétaire ni en boutique, et le stock valorisé des
// rapports ne comptait que les fiches du propriétaire.
//
// `user_id` reste renseigné — c'est désormais « qui a créé la fiche », une
// information d'audit, plus une clé d'accès. La politique RLS `products_access`
// accepte les deux depuis 20260606.

export async function getProductsAction(): Promise<ActionResult<Product[]>> {
  return attempt(async () => {
  const { supabase, businessId } = await getBusinessContext();

  const { data, error } = await supabase
    .from('products')
    .select(BASE_COLUMNS + ',' + COST_COLUMNS)
    .eq('business_id', businessId)
    .order('name');

  if (!error) return (data ?? []).map((p: any) => ({ ...COST_DEFAULTS, ...p })) as Product[];

  const { data: fallback, error: fallbackError } = await supabase
    .from('products')
    .select(BASE_COLUMNS)
    .eq('business_id', businessId)
    .order('name');

  if (fallbackError) throw new Error(fallbackError.message);
  return (fallback ?? []).map((p: any) => ({ ...COST_DEFAULTS, ...p })) as Product[];
  });
}

export async function createProductAction(payload: ProductPayload): Promise<ActionResult<string>> {
  return attempt(async () => {
  // `business_id` est la clé de cadrage ; `user_id` reste écrit pour dire qui a
  // créé la fiche. Un déclencheur en base rattache d'office `business_id` si un
  // appelant l'oublie — plus aucune fiche orpheline.
  const { supabase, userId, businessId } = await getBusinessContext();

  // ── Le plafond du catalogue ───────────────────────────────────────────────
  //
  // « Jusqu'à 50 produits » est écrit sur la page de prix d'Esansyel depuis le
  // premier jour, et rien ne le tenait : `PLAN_MAX_PRODUCTS` n'était lu nulle
  // part. Une limite annoncée qui ne s'applique pas ne fait pas monter d'offre,
  // elle apprend seulement au marchand que les chiffres du produit sont
  // décoratifs.
  //
  // Le plafond inclut les fiches gagnées par parrainage : dix de plus par
  // filleul inscrit, jusqu'à cinquante. C'est le compte du serveur, pas celui
  // de l'écran — un appel direct doit buter sur le même mur.
  await assertProductSlotAvailable(supabase, businessId);

  const { data, error } = await supabase.from('products').insert({
    user_id:        userId,
    business_id:    businessId,
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
  return data.id as string;
  });
}

/**
 * Lève une `PlanLimitError` si une fiche de plus dépasserait le plafond.
 *
 * Le message nomme les DEUX sorties, parce qu'un mur sans porte ne fait pas
 * acheter : payer l'offre du dessus, ou amener un marchand. La seconde est
 * gratuite et c'est exactement là qu'elle se propose — au moment précis où la
 * limite se fait sentir.
 */
async function assertProductSlotAvailable(supabase: any, businessId: string): Promise<void> {
  const max = await productAllowance();
  if (!Number.isFinite(max)) return;

  // Compté par entreprise, comme le catalogue lui-même. Compter par `user_id`
  // laissait passer les fiches créées par un employé : le plafond annoncé
  // n'était pas celui qui s'appliquait.
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

export async function updateProductAction(id: string, payload: ProductPayload): Promise<ActionResult> {
  return attempt(async () => {
  const { supabase, businessId } = await getBusinessContext();

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
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);
  void logActivity({ action: 'update', entity: 'product', entityId: id, newValues: { name: payload.name, sale_price: payload.sale_price, stock_quantity: payload.stock_quantity } });
  revalidatePath('/products');
  });
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  return attempt(async () => {
  const { supabase, businessId } = await getBusinessContext();

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
    .eq('business_id', businessId);

  if (error) throw new Error(error.message);
  void logActivity({ action: 'delete', entity: 'product', entityId: id });
  revalidatePath('/products');
  });
}
