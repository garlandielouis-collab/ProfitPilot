'use server';

// ─────────────────────────────────────────────────────────────────────────────
// AI Merchandising — le conseiller du catalogue (§17, §18)
//
// « Quels produits devrais-je mettre en avant ? Lesquels ont besoin de
// meilleures photos ? Lesquels se vendent ensemble ? Crée un lot. »
//
// ── Ce que le modèle voit, et ce qu'il ne voit pas ──────────────────────────
//
// Il ne voit PAS la base. Il reçoit un tableau de faits déjà calculés : ce qui
// manque à chaque fiche (photo, description, SEO, publication) et ce qui s'est
// réellement vendu ces quatre-vingt-dix jours (`v_store_bestsellers`), plus les
// paires réellement achetées ensemble (`v_store_bought_together`).
//
// C'est la différence entre un conseil et une invention. « Ce produit semble
// être un best-seller » n'est pas une opinion de modèle de langage : c'est une
// somme de `sale_items`. Le modèle sert à ORDONNER et à FORMULER, pas à
// estimer des chiffres que la base connaît.
//
// ── Un lot n'est pas une suggestion affichée ────────────────────────────────
//
// Quand le marchand accepte, une ligne `product_bundles` est créée avec un prix
// EN CLAIR. Pas un pourcentage appliqué à la volée : le jour où le prix d'un
// des produits bouge, un lot défini par pourcentage change de prix tout seul,
// sur une vitrine publique, sans que personne l'ait décidé.
//
// Et il naît INACTIF. Accepter une proposition et la publier sont deux gestes,
// pour la même raison que générer et appliquer en sont deux dans le Studio.
// ─────────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { assertFeature } from '../../lib/entitlements';
import { getBusinessContext, requirePermission } from '../../lib/serverAuth';
import { getSupabaseService } from '../../lib/supabaseServiceClient';
import { revalidateStore } from '../../lib/storefrontData';
import { creditBalance, refundCredits, spendCredits } from '../../lib/ai/credits';
import {
  analyseCatalog,
  copyProviderAvailable,
  proposeBundles,
  type CatalogEntry,
  type CopyLanguage,
} from '../../lib/ai/copywriter';

const COMMERCE_FEATURE = 'online_store' as const;

/** Au-delà, l'invite devient chère et le conseil se dilue. Les plus récents d'abord. */
const CATALOG_LIMIT = 60;

export type Finding = {
  productId:      string;
  productName:    string;
  issue:          string;
  recommendation: string;
  action:         'write_copy' | 'improve_photo' | 'write_seo' | 'set_price' | 'feature' | 'restock';
  priority:       'haute' | 'moyenne' | 'basse';
};

export type CatalogReport = {
  summary:   string;
  findings:  Finding[];
  remaining: number;
};

export type BundleProposal = {
  name:            string;
  rationale:       string;
  discountPercent: number;
  items:           Array<{ productId: string; productName: string; price: number }>;
  regularTotal:    number;
  suggestedPrice:  number;
};

export type BundleRow = {
  id:           string;
  name:         string;
  description:  string | null;
  price:        number;
  isActive:     boolean;
  source:       'manual' | 'ai';
  regularTotal: number;
  itemCount:    number;
  inStock:      boolean;
  items:        Array<{ productId: string; productName: string; quantity: number }>;
};

export type MerchandisingState = {
  productCount: number;
  /** Ce qui manque, compté en base. Affiché même sans IA — c'est déjà un conseil. */
  missingPhoto: number;
  missingCopy:  number;
  missingSeo:   number;
  unpublished:  number;
  bundles:      BundleRow[];
  credits:      number;
  available:    boolean;
};

// ── Le catalogue, réduit aux faits ──────────────────────────────────────────

type ProductRow = {
  id:                 string;
  name:               string;
  category:           string | null;
  sale_price:         number | null;
  stock_quantity:     number | null;
  image_url:          string | null;
  enhanced_image_url: string | null;
  store_description:  string | null;
  seo_title:          string | null;
  is_published_to_store: boolean | null;
};

async function loadCatalog(businessId: string): Promise<{
  rows:    ProductRow[];
  entries: CatalogEntry[];
  names:   Map<string, string>;
  prices:  Map<string, number>;
}> {
  const svc = getSupabaseService();

  const { data } = await svc
    .from('products')
    .select(
      'id, name, category, sale_price, stock_quantity, image_url, enhanced_image_url, ' +
      'store_description, seo_title, is_published_to_store',
    )
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(CATALOG_LIMIT);

  // `as unknown as` : la liste de colonnes est une CONCATÉNATION, que le
  // typage de supabase-js ne sait pas relire. Il rend alors `GenericStringError[]`,
  // et le compilateur refuse à raison une conversion directe. Le contrat réel
  // est celui du `select` ci-dessus.
  const rows = (data ?? []) as unknown as ProductRow[];

  // Les ventes réelles. Vue absente (migration non jouée) : on continue sans —
  // le conseil perd une dimension, il ne disparaît pas.
  const sold = new Map<string, number>();
  const { data: best } = await svc
    .from('v_store_bestsellers')
    .select('product_id, units_sold')
    .eq('business_id', businessId);

  for (const row of (best ?? []) as Array<{ product_id: string; units_sold: number }>) {
    sold.set(row.product_id, Number(row.units_sold) || 0);
  }

  const names  = new Map(rows.map((r) => [r.id, r.name]));
  const prices = new Map(rows.map((r) => [r.id, Number(r.sale_price) || 0]));

  const entries: CatalogEntry[] = rows.map((r) => ({
    id:            r.id,
    name:          r.name,
    category:      r.category,
    price:         r.sale_price,
    stock:         r.stock_quantity,
    hasImage:      Boolean(r.image_url || r.enhanced_image_url),
    hasCopy:       Boolean(r.store_description?.trim()),
    hasSeo:        Boolean(r.seo_title?.trim()),
    published:     Boolean(r.is_published_to_store),
    unitsSold90d:  sold.get(r.id) ?? 0,
  }));

  return { rows, entries, names, prices };
}

// ── L'écran ─────────────────────────────────────────────────────────────────

export async function getMerchandisingState(): Promise<MerchandisingState> {
  await assertFeature(COMMERCE_FEATURE);
  const { businessId } = await getBusinessContext();

  const { entries } = await loadCatalog(businessId);

  return {
    productCount: entries.length,
    missingPhoto: entries.filter((e) => !e.hasImage).length,
    missingCopy:  entries.filter((e) => !e.hasCopy).length,
    missingSeo:   entries.filter((e) => !e.hasSeo).length,
    unpublished:  entries.filter((e) => !e.published).length,
    bundles:      await listBundles(businessId),
    credits:      await creditBalance(businessId),
    available:    copyProviderAvailable(),
  };
}

// ── §17 : l'analyse ─────────────────────────────────────────────────────────

export async function runCatalogAnalysis(
  language: CopyLanguage = 'fr',
): Promise<CatalogReport> {
  await assertFeature(COMMERCE_FEATURE);
  const { businessId, userId } = await requirePermission('products:write');

  const { entries, names } = await loadCatalog(businessId);
  if (entries.length === 0) {
    throw new Error("Votre catalogue est vide : ajoutez un produit avant d'analyser.");
  }

  const { remaining } = await spendCredits(businessId, userId, 'merchandising');

  try {
    const result = await analyseCatalog(entries, language);

    // Un identifiant que le modèle aurait inventé ne désigne aucun produit :
    // la ligne est écartée plutôt qu'affichée avec un nom vide.
    const findings: Finding[] = result.findings
      .filter((f) => names.has(f.productId))
      .map((f) => ({
        productId:      f.productId,
        productName:    names.get(f.productId)!,
        issue:          f.issue,
        recommendation: f.recommendation,
        action:         f.action,
        priority:       f.priority,
      }));

    return { summary: result.summary, findings, remaining };
  } catch (err) {
    await refundCredits(businessId, 'merchandising');
    throw err;
  }
}

// ── §18 : les lots ──────────────────────────────────────────────────────────

export async function runBundleProposals(
  language: CopyLanguage = 'fr',
): Promise<{ proposals: BundleProposal[]; remaining: number }> {
  await assertFeature(COMMERCE_FEATURE);
  const { businessId, userId } = await requirePermission('products:write');

  const { entries, names, prices } = await loadCatalog(businessId);
  if (entries.length < 2) {
    throw new Error('Il faut au moins deux produits pour composer un lot.');
  }

  // Les paires réellement achetées ensemble, les plus fréquentes d'abord.
  const { data: together } = await getSupabaseService()
    .from('v_store_bought_together')
    .select('product_id, partner_id, times_together')
    .eq('business_id', businessId)
    .order('times_together', { ascending: false })
    .limit(20);

  const affinities = ((together ?? []) as Array<{
    product_id: string; partner_id: string; times_together: number;
  }>)
    // Chaque paire apparaît deux fois dans la vue (A→B et B→A) : on n'en garde
    // qu'un sens, sinon le modèle croit à deux associations distinctes.
    .filter((r) => r.product_id < r.partner_id)
    .filter((r) => names.has(r.product_id) && names.has(r.partner_id))
    .map((r) => ({ a: r.product_id, b: r.partner_id, times: Number(r.times_together) || 0 }));

  const { remaining } = await spendCredits(businessId, userId, 'bundle');

  try {
    const result = await proposeBundles(entries, affinities, language);

    const proposals: BundleProposal[] = result.bundles
      .map((b) => {
        const ids = b.productIds.filter((id) => names.has(id));
        if (ids.length < 2) return null;

        const items = ids.map((id) => ({
          productId:   id,
          productName: names.get(id)!,
          price:       prices.get(id) ?? 0,
        }));

        const regularTotal = items.reduce((sum, i) => sum + i.price, 0);
        // Le prix est arrondi à l'unité : un lot à 38,74 gourdes n'existe pas
        // dans une boutique haïtienne.
        const suggestedPrice = Math.round(regularTotal * (1 - b.discountPercent / 100));

        return {
          name:            b.name,
          rationale:       b.rationale,
          discountPercent: b.discountPercent,
          items,
          regularTotal,
          suggestedPrice,
        };
      })
      .filter((b): b is BundleProposal => b !== null);

    return { proposals, remaining };
  } catch (err) {
    await refundCredits(businessId, 'bundle');
    throw err;
  }
}

const acceptSchema = z.object({
  name:        z.string().trim().min(1).max(120),
  description: z.string().trim().max(600).optional(),
  price:       z.number().finite().min(0),
  source:      z.enum(['manual', 'ai']).default('ai'),
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(99) }))
    .min(2)
    .max(6),
});

export type AcceptBundleInput = z.input<typeof acceptSchema>;

/**
 * Crée le lot. Inactif : publier est un second geste.
 *
 * Les produits sont revérifiés contre l'entreprise. Le navigateur envoie des
 * identifiants ; sans ce contrôle, un lot pourrait embarquer le produit d'un
 * autre marchand et l'exposer sur cette vitrine.
 */
export async function acceptBundle(input: AcceptBundleInput): Promise<string> {
  await assertFeature(COMMERCE_FEATURE);
  const { businessId } = await requirePermission('products:write');

  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) throw new Error('Lot invalide.');
  const value = parsed.data;

  const svc = getSupabaseService();
  const ids = value.items.map((i) => i.productId);

  const { data: owned } = await svc
    .from('products')
    .select('id')
    .eq('business_id', businessId)
    .in('id', ids);

  const ownedIds = new Set(((owned ?? []) as Array<{ id: string }>).map((p) => p.id));
  if (ownedIds.size !== new Set(ids).size) {
    throw new Error("Un des produits de ce lot n'appartient pas à votre entreprise.");
  }

  const { data: bundle, error } = await svc
    .from('product_bundles')
    .insert({
      business_id: businessId,
      name:        value.name,
      description: value.description ?? null,
      price:       value.price,
      source:      value.source,
      is_active:   false,
    })
    .select('id')
    .single();

  if (error || !bundle) throw new Error(`Création impossible : ${error?.message ?? 'inconnue'}`);

  const { error: itemsErr } = await svc.from('product_bundle_items').insert(
    value.items.map((i) => ({
      bundle_id:  bundle.id,
      product_id: i.productId,
      quantity:   i.quantity,
    })),
  );

  // Un lot sans lignes n'est pas un lot à moitié créé, c'est un déchet : on le
  // retire plutôt que de le laisser dans la liste du marchand.
  if (itemsErr) {
    await svc.from('product_bundles').delete().eq('id', bundle.id);
    throw new Error(`Création impossible : ${itemsErr.message}`);
  }

  revalidatePath('/boutique/merchandising');
  return bundle.id;
}

/** Publie ou retire le lot de la vitrine. */
export async function setBundleActive(bundleId: string, active: boolean): Promise<void> {
  await assertFeature(COMMERCE_FEATURE);
  const { businessId } = await requirePermission('products:write');

  const { error } = await getSupabaseService()
    .from('product_bundles')
    .update({ is_active: active })
    .eq('id', bundleId)
    .eq('business_id', businessId);

  if (error) throw new Error(`Mise à jour impossible : ${error.message}`);

  await refreshStorefront(businessId);
  revalidatePath('/boutique/merchandising');
}

export async function deleteBundle(bundleId: string): Promise<void> {
  await assertFeature(COMMERCE_FEATURE);
  const { businessId } = await requirePermission('products:write');

  const { error } = await getSupabaseService()
    .from('product_bundles')
    .delete()
    .eq('id', bundleId)
    .eq('business_id', businessId);

  if (error) throw new Error(`Suppression impossible : ${error.message}`);

  await refreshStorefront(businessId);
  revalidatePath('/boutique/merchandising');
}

// ── Lecture ─────────────────────────────────────────────────────────────────

async function listBundles(businessId: string): Promise<BundleRow[]> {
  const svc = getSupabaseService();

  const { data } = await svc
    .from('product_bundles')
    .select(
      'id, name, description, price, is_active, source, ' +
      'product_bundle_items ( product_id, quantity, products ( name ) )',
    )
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as Array<Record<string, any>>;
  if (rows.length === 0) return [];

  // Le prix « pièce par pièce » vient de la vue : le comparatif affiché sur la
  // vitrine est un argument de vente, et un argument de vente se calcule en base.
  const totals = new Map<string, { regular: number; count: number; inStock: boolean }>();
  const { data: t } = await svc
    .from('v_product_bundle_totals')
    .select('bundle_id, regular_total, item_count, in_stock')
    .eq('business_id', businessId);

  for (const row of (t ?? []) as Array<{
    bundle_id: string; regular_total: number; item_count: number; in_stock: boolean | null;
  }>) {
    totals.set(row.bundle_id, {
      regular: Number(row.regular_total) || 0,
      count:   Number(row.item_count) || 0,
      inStock: row.in_stock !== false,
    });
  }

  return rows.map((r) => {
    const total = totals.get(r.id);
    const items = ((r.product_bundle_items ?? []) as Array<Record<string, any>>).map((i) => ({
      productId:   i.product_id,
      productName: i.products?.name ?? 'Produit retiré',
      quantity:    Number(i.quantity) || 1,
    }));

    return {
      id:           r.id,
      name:         r.name,
      description:  r.description,
      price:        Number(r.price) || 0,
      isActive:     Boolean(r.is_active),
      source:       (r.source === 'ai' ? 'ai' : 'manual') as 'manual' | 'ai',
      regularTotal: total?.regular ?? 0,
      itemCount:    total?.count ?? items.length,
      inStock:      total?.inStock ?? true,
      items,
    };
  });
}

async function refreshStorefront(businessId: string) {
  const { data } = await getSupabaseService()
    .from('store_settings')
    .select('slug')
    .eq('business_id', businessId)
    .maybeSingle();

  await revalidateStore((data as { slug?: string } | null)?.slug ?? null, businessId);
}
