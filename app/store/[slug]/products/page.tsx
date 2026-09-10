// ─────────────────────────────────────────────────────────────────────────────
// Le catalogue
//
// La page charge une fois, largement, et laisse le filtrage au navigateur. Ce
// choix est délibéré : sur une connexion irrégulière, un filtre qui repart au
// serveur à chaque clic fige la page plusieurs secondes sans rien dire. Une
// boutique ProfitPilot a des dizaines de produits, rarement des milliers — deux
// cents fiches tiennent dans la mémoire d'un téléphone d'entrée de gamme, et le
// filtre y répond au geste.
//
// Les paramètres d'URL ne servent donc qu'à ouvrir la page sur le bon état :
// un lien partagé, un retour arrière, un rayon cliqué depuis l'accueil.
//
// ── Le rayon, et le bug qu'il cachait ──────────────────────────────────────
//
// `getStoreCategories` renvoie `category_id` quand la fiche en a un, et le
// libellé sinon. Le lien de l'accueil portait donc parfois un UUID, que cette
// page passait à `getStoreProducts({ category })` — comparé à la colonne TEXTE
// `category`. Résultat : sur toute boutique dont les produits ont un
// `category_id`, cliquer un rayon depuis l'accueil ouvrait un catalogue vide.
// Un rayon annoncé « 12 articles » qui s'ouvre sur rien, c'est un visiteur qui
// referme l'onglet.
//
// Le rayon n'est donc plus filtré en base du tout : il l'est dans le
// navigateur, où `matchesCategory` compare le paramètre AUX DEUX champs de la
// fiche — son identifiant et son libellé. Les deux formes de lien restent
// servies, et une URL publique déjà partagée ou indexée ne se casse pas parce
// qu'on a normalisé un schéma.
// ─────────────────────────────────────────────────────────────────────────────

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  loadStore, loadCatalog, loadCategories, loadFacets, loadRatings,
  buildStorefrontContext,
} from '../../../../lib/storefrontData';
import { toStoreView } from '../../../../components/store/types';
import { resolveTemplateId } from '../../../../components/store/templates/registry';
import { ProductsClient } from './ProductsClient';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = { title: 'Produits' };

const SORTS = ['newest', 'price_asc', 'price_desc', 'name'] as const;
type Sort = (typeof SORTS)[number];

/** Un paramètre d'URL est du texte fourni par le visiteur : on le range. */
function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.slice(0, 120) ?? '';
}

/**
 * Les facettes choisies, lues depuis l'URL.
 *
 * Elles arrivent en `f_couleur=Rouge`. Le préfixe évite qu'un attribut nommé
 * « sort » ou « search » n'écrase un paramètre du catalogue — le marchand
 * nomme ses attributs librement, et rien ne l'empêche d'en appeler un « page ».
 */
function readFacets(sp: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(sp)) {
    if (!key.startsWith('f_')) continue;
    const name  = key.slice(2).slice(0, 40);
    const value = one(raw);
    if (name && value) out[name] = value;
  }
  return out;
}

export default async function StoreProductsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp       = await searchParams;
  const store    = await loadStore(slug);
  if (!store) notFound();

  const ctx        = await buildStorefrontContext(store, slug);
  const templateId = resolveTemplateId(store.template_id);
  const view       = toStoreView(store, { base: ctx.base, origin: ctx.origin, templateId });

  const category = one(sp.category);
  const search   = one(sp.search);
  const rawSort  = one(sp.sort);
  const sort: Sort = (SORTS as readonly string[]).includes(rawSort) ? (rawSort as Sort) : 'newest';

  const onlyPublished = ctx.theme.catalog.mode === 'selected';

  // Le catalogue entier, une fois. Le rayon n'est PAS appliqué ici : il l'est
  // dans le navigateur, où changer de rayon est instantané et où la
  // correspondance sait comparer un identifiant comme un libellé.
  const [products, categories, facets, ratings] = await Promise.all([
    loadCatalog(store.business_id, { sort, limit: 200, onlyPublished }),
    loadCategories(store.business_id, onlyPublished),
    loadFacets(store.business_id, onlyPublished),
    loadRatings(store.business_id),
  ]);

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
      initialCategory={category}
      initialSort={sort}
      initialSearch={search}
      initialFacets={readFacets(sp)}
      initialInStock={one(sp.stock) === '1'}
      initialFocusSearch={one(sp.focus) === 'search'}
    />
  );
}
