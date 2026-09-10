// ─────────────────────────────────────────────────────────────────────────────
// Le chargement de la vitrine, mis en cache
//
// Une vitrine change quand le marchand la change : quelques fois par semaine.
// Elle est lue à chaque visiteur. Sans cache, chaque visite déclenche trois
// allers-retours Supabase — et sur le plan gratuit, le projet se met en veille
// entre deux pics : le premier client de la journée attend le réveil de la base.
//
// D'où `unstable_cache` avec des étiquettes. La vitrine est servie depuis le
// cache, et l'éditeur appelle `revalidateStore()` en sauvegardant : le marchand
// voit son changement tout de suite, le visiteur ne paie jamais la lecture.
//
// C'est l'ISR à la demande que la spécification demandait, exprimé au niveau de
// la donnée plutôt que de la page — parce que la page, elle, doit rester
// dynamique pour lire l'en-tête d'hôte posé par le middleware.
// ─────────────────────────────────────────────────────────────────────────────

import { unstable_cache, updateTag } from 'next/cache';
import { headers } from 'next/headers';
import {
  getStoreBySlug,
  getStoreProducts,
  getStoreCategories,
  getStoreProduct,
  getStoreBestsellerIds,
  getStoreBundles,
  getStoreFacets,
  type StoreSettings,
  type StoreProduct,
  type StoreCategory,
} from '../app/actions/store-public';
import { getStoreSections, getStoreReviews, getStoreRatings } from '../app/actions/store-content';
import { parseThemeConfig, type ThemeConfig } from './storeTheme';

// ── Étiquettes de cache ─────────────────────────────────────────────────────

const storeTag    = (slug: string) => `store:${slug}`;
const catalogTag  = (businessId: string) => `store-catalog:${businessId}`;

/** Cinq minutes : le filet, si une invalidation se perd. */
const TTL = 300;

// ── Lectures ────────────────────────────────────────────────────────────────

export const loadStore = (slug: string) =>
  unstable_cache(
    async () => getStoreBySlug(slug),
    ['storefront-settings', slug],
    { tags: [storeTag(slug)], revalidate: TTL },
  )();

export const loadCatalog = (
  businessId: string,
  opts: Parameters<typeof getStoreProducts>[1] = {},
) =>
  unstable_cache(
    async () => getStoreProducts(businessId, opts),
    ['storefront-catalog', businessId, JSON.stringify(opts ?? {})],
    { tags: [catalogTag(businessId)], revalidate: TTL },
  )();

export const loadCategories = (businessId: string, onlyPublished = false) =>
  unstable_cache(
    async () => getStoreCategories(businessId, onlyPublished),
    ['storefront-categories', businessId, String(onlyPublished)],
    { tags: [catalogTag(businessId)], revalidate: TTL },
  )();

export const loadProduct = (businessId: string, productId: string) =>
  unstable_cache(
    async () => getStoreProduct(businessId, productId),
    ['storefront-product', businessId, productId],
    { tags: [catalogTag(businessId)], revalidate: TTL },
  )();

/**
 * L'ordre des sections. Étiqueté comme la vitrine, pas comme le catalogue :
 * il change quand le marchand réorganise sa page, pas quand il ajoute un
 * produit.
 */
export const loadSections = (slug: string, businessId: string) =>
  unstable_cache(
    async () => getStoreSections(businessId),
    ['storefront-sections', businessId],
    { tags: [storeTag(slug)], revalidate: TTL },
  )();

/**
 * Les meilleures ventes et les avis publiés.
 *
 * Étiquetés au catalogue : une vente ou un avis publié change ce que la page
 * d'accueil montre, et le marchand doit le voir sans attendre le TTL.
 */
export const loadBestsellerIds = (businessId: string) =>
  unstable_cache(
    async () => getStoreBestsellerIds(businessId, 12),
    ['storefront-bestsellers', businessId],
    { tags: [catalogTag(businessId)], revalidate: TTL },
  )();

export const loadReviews = (businessId: string) =>
  unstable_cache(
    async () => getStoreReviews(businessId, 9),
    ['storefront-reviews', businessId],
    { tags: [catalogTag(businessId)], revalidate: TTL },
  )();

/**
 * Les notes moyennes, produit par produit.
 *
 * Une seule lecture pour toute la grille. Étiquetée au catalogue : un avis que
 * le marchand vient de publier doit apparaître sur ses cartes sans attendre le
 * TTL.
 */
export const loadRatings = (businessId: string) =>
  unstable_cache(
    async () => getStoreRatings(businessId),
    ['storefront-ratings', businessId],
    { tags: [catalogTag(businessId)], revalidate: TTL },
  )();

export const loadBundles = (businessId: string) =>
  unstable_cache(
    async () => getStoreBundles(businessId, 12),
    ['storefront-bundles', businessId],
    { tags: [catalogTag(businessId)], revalidate: TTL },
  )();

export const loadFacets = (businessId: string, onlyPublished: boolean) =>
  unstable_cache(
    async () => getStoreFacets(businessId, onlyPublished),
    ['storefront-facets', businessId, String(onlyPublished)],
    { tags: [catalogTag(businessId)], revalidate: TTL },
  )();

// ── Invalidation ────────────────────────────────────────────────────────────

/**
 * À appeler depuis l'éditeur après toute écriture qui change la vitrine.
 *
 * `updateTag` et non `revalidateTag` : le marchand vient d'enregistrer, il va
 * ouvrir sa boutique dans la seconde. `updateTag` porte la sémantique
 * « relis ce que tu viens d'écrire » et purge le cache dans la foulée de
 * l'action, là où `revalidateTag` se contente de marquer l'entrée périmée — le
 * marchand verrait encore l'ancienne version, et conclurait que rien n'a été
 * enregistré.
 *
 * Contrainte à connaître : `updateTag` ne s'appelle que depuis une action
 * serveur. Tous les appelants de cette fonction en sont.
 */
export async function revalidateStore(slug: string | null, businessId?: string | null) {
  if (slug)       updateTag(storeTag(slug));
  if (businessId) updateTag(catalogTag(businessId));
}

// ── Contexte de rendu ───────────────────────────────────────────────────────

export type StoreRouting = {
  /**
   * Le préfixe de tous les liens internes de la vitrine.
   *
   * Chaîne vide quand la boutique est servie depuis son propre hôte — le
   * middleware a réécrit vers /store/<slug>, mais le navigateur affiche « / » et
   * les liens doivent rester dans ce référentiel. `/store/<slug>` sinon, quand
   * on visite la vitrine depuis le domaine de l'application (aperçu, partage).
   */
  base:      string;
  /** L'hôte réellement demandé, pour les URL canoniques et OpenGraph. */
  host:      string | null;
  /** Vrai quand la vitrine est servie depuis son sous-domaine ou son domaine. */
  ownHost:   boolean;
};

export async function getStoreRouting(slug: string): Promise<StoreRouting> {
  const h = await headers();
  const storeHost = h.get('x-pp-store-host');
  const storeSlug = h.get('x-pp-store-slug');
  const ownHost   = Boolean(storeHost) && storeSlug === slug;

  return {
    base:    ownHost ? '' : `/store/${slug}`,
    host:    storeHost,
    ownHost,
  };
}

/**
 * Tout ce dont un gabarit a besoin pour se dessiner : la vitrine, son thème
 * déjà validé, et le référentiel de ses liens.
 */
export type StorefrontContext = {
  store:    StoreSettings;
  theme:    ThemeConfig;
  slug:     string;
  base:     string;
  host:     string | null;
  currency: string;
  /** L'URL publique absolue, pour le partage et les balises canoniques. */
  origin:   string;
};

export async function buildStorefrontContext(
  store: StoreSettings,
  slug: string,
): Promise<StorefrontContext> {
  const routing = await getStoreRouting(slug);
  const theme = parseThemeConfig(
    store.theme_config,
    { primary_color: store.primary_color, secondary_color: store.secondary_color },
    store.template_id,
  );

  const origin = routing.host
    ? `${routing.host.startsWith('localhost') ? 'http' : 'https'}://${routing.host}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? '');

  return {
    store,
    theme,
    slug,
    base:     routing.base,
    host:     routing.host,
    currency: store.currency ?? 'HTG',
    origin,
  };
}
