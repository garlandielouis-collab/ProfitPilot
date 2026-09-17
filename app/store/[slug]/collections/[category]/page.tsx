// ─────────────────────────────────────────────────────────────────────────────
// Une collection — /collections/<rayon>
//
// Le §31 demande des URL propres : `/products/[slug]` pour une fiche,
// `/collections/[slug]` pour un rayon. La vitrine n'avait que
// `/products?category=<uuid>` — une adresse qu'aucun moteur de recherche ne
// comprend comme une page de rayon, et qu'aucun visiteur ne peut lire.
//
// La page ne duplique PAS le catalogue : elle résout le rayon, puis rend le
// même écran filtrable. Deux implémentations du même catalogue divergeraient au
// premier correctif — c'est exactement ce que la refonte du moteur de gabarits
// a défait ailleurs.
//
// Le segment accepte les deux formes : l'identifiant de rayon quand la fiche en
// a un, son libellé normalisé sinon. Une adresse publique déjà partagée ne se
// casse pas parce que le schéma a été normalisé.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  loadStore, loadStorefrontCatalog, loadCategories, loadFacets, loadRatings,
  buildStorefrontContext,
} from '../../../../../lib/storefrontData';
import { slugify, storePublicUrl } from '../../../../../lib/storeTheme';
import { toStoreView } from '../../../../../components/store/types';
import { resolveTemplateId } from '../../../../../components/store/templates/registry';
import { ProductsClient } from '../../products/ProductsClient';
import type { StoreCategory } from '../../../../../components/store/types';

type Props = {
  params: Promise<{ slug: string; category: string }>;
};

/**
 * Le rayon désigné par le segment d'URL.
 *
 * Trois écritures acceptées, dans cet ordre : l'identifiant exact, le libellé
 * exact, le libellé normalisé (« Soins du visage » → « soins-du-visage »).
 * C'est la troisième qui produit les adresses lisibles ; les deux premières
 * existent pour que les liens déjà en circulation continuent de mener quelque
 * part.
 */
function findCategory(categories: StoreCategory[], segment: string): StoreCategory | null {
  const raw = decodeURIComponent(segment);
  return (
    categories.find((c) => c.id === raw)
    ?? categories.find((c) => c.name === raw)
    ?? categories.find((c) => slugify(c.name) === slugify(raw))
    ?? null
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, category } = await params;
  const store = await loadStore(slug);
  if (!store) return {};

  const ctx = await buildStorefrontContext(store, slug);
  const categories = await loadCategories(
    store.business_id,
    ctx.theme.catalog.mode === 'selected',
  );
  const found = findCategory(categories, category);
  if (!found) return { title: 'Rayon introuvable' };

  const origin = ctx.origin || storePublicUrl(store);

  return {
    title: found.name,
    description: `${found.name} — ${found.count} article${found.count > 1 ? 's' : ''} chez ${store.store_name ?? 'nous'}.`,
    alternates: { canonical: `${origin}${ctx.base}/collections/${slugify(found.name)}` },
    openGraph: {
      type:  'website',
      title: found.name,
      description: `${found.count} article${found.count > 1 ? 's' : ''} disponibles.`,
    },
  };
}

export default async function CollectionPage({ params }: Props) {
  const { slug, category } = await params;
  const store = await loadStore(slug);
  if (!store) notFound();

  const ctx        = await buildStorefrontContext(store, slug);
  const templateId = resolveTemplateId(store.template_id);
  const view       = toStoreView(store, { base: ctx.base, origin: ctx.origin, templateId });

  const onlyPublished = ctx.theme.catalog.mode === 'selected';

  const [products, categories, facets, ratings] = await Promise.all([
    loadStorefrontCatalog(store.business_id, onlyPublished),
    loadCategories(store.business_id, onlyPublished),
    loadFacets(store.business_id, onlyPublished),
    loadRatings(store.business_id),
  ]);

  const found = findCategory(categories, category);
  // Un rayon qui n'existe plus renvoie 404 plutôt qu'un catalogue complet : une
  // page qui répond « voici tout » à une adresse précise trompe autant le
  // visiteur que le moteur de recherche qui l'a indexée.
  if (!found) notFound();

  const visible = ctx.theme.catalog.hideOutOfStock
    ? products.filter((p) => p.stock > 0 || p.allow_backorders)
    : products;

  return (
    <ProductsClient
      store={view}
      products={visible}
      categories={categories}
      facets={facets}
      ratings={ratings}
      initialCategory={found.id}
      initialSort="newest"
      initialSearch=""
      initialFacets={{}}
      initialInStock={false}
      initialFocusSearch={false}
    />
  );
}
