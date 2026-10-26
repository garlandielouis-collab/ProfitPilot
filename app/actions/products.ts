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
  /** Un service ne se stocke pas : `track_inventory` passe à faux (lib/kaye.ts). */
  kind?: ProductKind;
  /** Affiché en premier dans la vente rapide (« 30 favoris », §13.1). */
  favorite?: boolean;
};

/** Ce que vend une fiche : une marchandise, ou un service (étude, §3). */
export type ProductKind = 'product' | 'service';

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
  kind: ProductKind;
  favorite: boolean;
  /** Faux pour un service : ni stock affiché, ni stock déduit. */
  track_inventory: boolean;
};

// `track_inventory` et `metadata` sont dans le schéma v2 depuis le premier jour :
// les lire ne dépend d'aucune migration.
const BASE_COLUMNS =
  'id,name,category,purchase_price,sale_price,stock_quantity,image_url,currency,track_inventory,metadata';

/**
 * La fiche système de la « vente au montant » (F01) : invisible au catalogue,
 * elle porte les ventes saisies sans produit (« 500 goud, c'est tout »).
 */
const QUICK_AMOUNT_KIND = 'quick_amount';

function mapProduct(p: any): Product {
  const meta = p?.metadata && typeof p.metadata === 'object' ? p.metadata : {};
  const { metadata: _drop, ...rest } = p;
  return {
    ...COST_DEFAULTS,
    ...rest,
    kind:            meta.kind === 'service' ? 'service' : 'product',
    favorite:        meta.favorite === true,
    track_inventory: p.track_inventory !== false,
  } as Product;
}

const isCatalogRow = (p: any) => p?.metadata?.kind !== QUICK_AMOUNT_KIND;

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

/** Un service ne se stocke pas ; le drapeau favori vit dans `metadata`. */
function kindFields(payload: Pick<ProductPayload, 'kind' | 'favorite'>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (payload.kind !== undefined) out.track_inventory = payload.kind !== 'service';
  if (payload.kind !== undefined || payload.favorite !== undefined) {
    out.metadata = {
      kind:     payload.kind ?? 'product',
      favorite: payload.favorite === true,
    };
  }
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

  if (!error) return (data ?? []).filter(isCatalogRow).map(mapProduct);

  const { data: fallback, error: fallbackError } = await supabase
    .from('products')
    .select(BASE_COLUMNS)
    .eq('business_id', businessId)
    .order('name');

  if (fallbackError) throw new Error(fallbackError.message);
  return (fallback ?? []).filter(isCatalogRow).map(mapProduct);
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
    ...kindFields(payload),
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

  // Le genre et le drapeau favori se FUSIONNENT dans `metadata` : écraser la
  // colonne effacerait ce qu'un autre écran y aurait rangé.
  if (payload.kind !== undefined || payload.favorite !== undefined) {
    const { data: current } = await supabase
      .from('products')
      .select('metadata, track_inventory')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle();
    const meta = current?.metadata && typeof current.metadata === 'object' ? current.metadata : {};
    const kind = payload.kind ?? (meta.kind === 'service' ? 'service' : 'product');
    fields.metadata = { ...meta, kind, favorite: payload.favorite ?? meta.favorite === true };
    fields.track_inventory = kind !== 'service';
  }

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

// ─────────────────────────────────────────────────────────────────────────────
// La vente au montant et les favoris (étude de marché inversée, F01 et §11.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * L'identifiant de la fiche système « Vant » de l'entreprise, créée au besoin.
 *
 * Une ligne de vente exige un produit (`sale_items.product_id NOT NULL`). Plutôt
 * que d'ouvrir cette contrainte — et toutes les vues qui joignent les produits —,
 * la vente « juste un montant » porte une fiche qui ne se stocke pas, ne
 * s'affiche dans aucun catalogue et ne compte pas dans le plafond de fiches :
 * ce n'est pas un produit du marchand, c'est la case « divers » du cahier.
 */
export async function ensureQuickAmountProductAction(): Promise<ActionResult<string>> {
  return attempt(async () => {
    const { supabase, userId, businessId } = await getBusinessContext();

    const { data: found } = await supabase
      .from('products')
      .select('id')
      .eq('business_id', businessId)
      .eq('metadata->>kind', QUICK_AMOUNT_KIND)
      .limit(1)
      .maybeSingle();
    if (found?.id) return found.id as string;

    const { data, error } = await supabase.from('products').insert({
      user_id:         userId,
      business_id:     businessId,
      name:            'Vant',
      purchase_price:  0,
      sale_price:      0,
      stock_quantity:  0,
      currency:        'HTG',
      track_inventory: false,
      metadata:        { kind: QUICK_AMOUNT_KIND },
    }).select('id').single();
    if (error) throw new Error(error.message);
    return data.id as string;
  });
}

export type FavoriteDraft = { name: string; sale_price: number; kind: ProductKind };

/**
 * Les favoris choisis à l'installation (§11.3, étape 2) : créés d'un coup, dans
 * la limite des fiches de l'offre. Un nom déjà au catalogue n'est pas recréé —
 * il devient favori.
 */
export async function createFavoritesAction(drafts: FavoriteDraft[]): Promise<ActionResult<number>> {
  return attempt(async () => {
    const { supabase, userId, businessId } = await getBusinessContext();

    const clean = drafts
      .map((d) => ({ name: String(d.name ?? '').trim(), price: Number(d.sale_price), kind: d.kind === 'service' ? 'service' as const : 'product' as const }))
      .filter((d) => d.name.length > 0 && Number.isFinite(d.price) && d.price > 0)
      .slice(0, 30);
    if (clean.length === 0) return 0;

    const { data: existing } = await supabase
      .from('products')
      .select('id, name, metadata')
      .eq('business_id', businessId);
    const byName = new Map<string, any>(
      (existing ?? []).map((p: any) => [String(p.name).trim().toLowerCase(), p]),
    );

    const fresh = clean.filter((d) => !byName.has(d.name.toLowerCase()));
    const known = clean.filter((d) => byName.has(d.name.toLowerCase()));

    // Les fiches existantes deviennent favorites, sans toucher à leur prix.
    for (const d of known) {
      const row = byName.get(d.name.toLowerCase());
      const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      if (meta.favorite === true) continue;
      await supabase.from('products').update({ metadata: { ...meta, favorite: true } }).eq('id', row.id);
    }

    if (fresh.length > 0) {
      const max = await productAllowance();
      const room = Number.isFinite(max) ? Math.max(0, max - (existing ?? []).filter(isCatalogRow).length) : fresh.length;
      if (room < fresh.length) {
        const planLabel = getPlanLabel(await getActivePlanKey());
        throw new PlanLimitError(max, (existing ?? []).length,
          `Votre catalogue est presque plein : l'offre ${planLabel} laisse encore ${room} fiche${room > 1 ? 's' : ''}.`);
      }
      const { error } = await supabase.from('products').insert(fresh.map((d) => ({
        user_id:         userId,
        business_id:     businessId,
        name:            d.name,
        purchase_price:  0,
        sale_price:      d.price,
        stock_quantity:  0,
        currency:        'HTG',
        track_inventory: d.kind !== 'service',
        metadata:        { kind: d.kind, favorite: true },
      })));
      if (error) throw new Error(error.message);
    }

    revalidatePath('/products');
    return clean.length;
  });
}
